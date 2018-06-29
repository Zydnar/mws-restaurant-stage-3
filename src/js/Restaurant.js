import DBHelper from './DBHelper';
import {Observable} from 'rxjs/Observable';
import {Subject} from 'rxjs/Subject';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/filter';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/fromEvent';
import {toast} from './toast';

/**
 * @class Restaurant
 */
class Restaurant {
    constructor() {
        const loadImages = document.getElementById('load-restaurants');
        loadImages.addEventListener('click', (event) => {
            event.preventDefault();
            const ul = document.getElementById('restaurants-list');
            this.removeFavoriteListeners();
            ul.innerHTML = '';
            this.state.thumbnails.map((obj) => {
                // so called multiple-clicking-user-guard - high probability of plagiarism
                const HTMLClone = obj.HTML[0].cloneNode(true);
                HTMLClone.innerHTML = obj.HTML[1] + obj.HTML[0].innerHTML;
                this.fillRestaurantsHTML(HTMLClone);
                // not pure, but easier
                obj.visible = true;
            });
            this.setFavoriteListeners();
        });
    }

    /**
     * @type {{restaurants: null|Subject, neighborhoods: Array, cuisines: Array, map: null|google.maps.Map, markers: Array, indexedDB: null|Dexie,
     * thumbnails: Array}}
     */
    state = {
        restaurants: null,
        neighborhoods: [],
        cuisines: [],
        map: null,
        markers: [],
        indexedDB: null,
        /**
         * @type {{HTML: [HTMLDivElement, String], visible: boolean}[]|[]}
         */
        thumbnails: [],
    };

    /**
     * Stream when back online
     *
     * @type {Observable<Event>}
     */
    ONLINE$ = Observable.fromEvent(window, 'online');

    /**
     * Stream when offline
     *
     * @type {Observable<Event>}
     */
    OFFLINE$ = Observable.fromEvent(window, 'offline').subscribe(() => {
        toast('It looks, you\'re offline. All requests will be send after connection reestablishing.', 'info');
    });

    /**
     * Sets state of Restaurant class
     *
     * @param {Object} patch - Patch object
     * @return {Object} Update patch for state
     */
    setState = (patch) => {
        return this.state = {
            ...this.state,
            ...patch,
        }
    };

    /**
     * Removes listeners for buttons to set restaurant as favorite
     *
     * @return {void}
     */
    removeFavoriteListeners = () => {
        [...document.getElementsByClassName('markAsFavorite')]
            .map(/**@type {HTMLButtonElement} */button => button.removeEventListener('click', button));
    };

    /**
     * Sets listeners for buttons to set restaurant as favorite
     *
     * @return {void}
     */
    setFavoriteListeners = () => {
        this.removeFavoriteListeners();
        [...document.getElementsByClassName('markAsFavorite')]
            .map(/**@type {HTMLButtonElement} */button => button.addEventListener('click', (event) => {
                event.preventDefault();
                const {id, favorite} = Restaurant.getDataAttributes(button.attributes);
                this.toggleFavorite(Number(id), JSON.parse(favorite), button)
            }));
    };

    /**
     * Fetch all neighborhoods and set their HTML.
     * @return {Subscription}
     */
    fetchNeighborhoods = () => {
        const fetchN = (r) => {
            this.state.neighborhoods = [];
            return DBHelper
                .fetchNeighborhoods(r)
                .subscribe(
                    (neighborhoods) => {
                        this.state.neighborhoods.push(neighborhoods);
                        this.fillNeighborhoodsHTML(neighborhoods);
                    },
                    (error) => console.error(error)
                );
        };

        if (this.state.restaurants && this.state.restaurants.length !== 0) {
            fetchN(this.state.restaurants);
        } else {
            fetchN(this.setRestaurants());
        }
    };

    /**
     * Set neighborhoods HTML.
     * @param {String} neighborhood
     * @return {HTMLOptionElement}
     */
    fillNeighborhoodsHTML = (neighborhood) => {
        const select = document.getElementById('neighborhoods-select');

        const option = document.createElement('option');
        option.innerHTML = neighborhood;
        option.value = neighborhood;
        try {
            select.append(option)
        } catch (e) {
            select.innerHTML += option.outerHTML;
        }
        return option;
    };

    /**
     * Fetch all cuisines and set their HTML.
     *
     * @return {void}
     */
    fetchCuisines = () => {
        this.state.cuisines = [];
        DBHelper.fetchCuisines(this.state.restaurants)
            .subscribe(
                (cuisine) => {
                    this.state.cuisines.push(cuisine);
                    this.fillCuisinesHTML(cuisine);
                },
                (error) => console.error(error)
            );
    };

    /**
     * Set cuisines HTML.
     *
     * @param {String} cuisine
     * @return {HTMLOptionElement}
     */
    fillCuisinesHTML = (cuisine) => {
        const select = document.getElementById('cuisines-select');

        const option = document.createElement('option');
        option.innerHTML = cuisine;
        option.value = cuisine;
        try {
            select.append(option)
        } catch (e) {
            select.innerHTML += option.outerHTML;
        }
        return option;
    };

    /**
     * When fetched or update restaurants this sets state.restaurants to collection of restaurants
     *
     * @return {Observable}
     */
    setRestaurants = () => {
        this.state.restaurants = new Subject();
        const DB = DBHelper.createIndexedDB(DBHelper.DATABASE_NAME);
        DBHelper.createIndexedStores(DB, {
            restaurants: 'id++,name,neighborhood,cuisine_type',
            reviews: 'id++,name,restaurant_id,createdAt,updatedAt,rating,comments',
            favoriteRequests: 'id++,restaurantID',
            reviewRequests: 'id++,reviewID',
        });
        this.resetRestaurants();
        this.setState({indexedDB: DB});
        return DBHelper.fetchRestaurants(DB)
            .map(
                (restaurant) => {
                    this.storeThumbnails(restaurant);
                    this.addMarkersToMap(restaurant);
                    this.state.restaurants.next(restaurant);
                    DB[DBHelper.DATABASE_NAME].put(restaurant)
                        .catch(console.error);
                    return restaurant;
                },
                (error) => console.error(error)
            );

    };

    /**
     * Sets restaurant as favorite also visually
     *
     * @param {Number} restaurantID
     * @param {boolean} isFavorite
     * @param {HTMLElement} element
     * @return {Observable}
     */
    toggleFavorite = (restaurantID, isFavorite, element) => {
        /**
         * @type {HTMLImageElement | Node | null}
         */
        const img = element.children[0];
        element.setAttribute('data-favorite', !isFavorite);
        element.setAttribute('aria-checked', !isFavorite);
        isFavorite ? element.setAttribute('aria-label', 'Unmark as favorite') : element.setAttribute('aria-label', 'Mark as favorite');
        img.className = `star ${!isFavorite ? 'favorite' : ''}`;
        img.src = !isFavorite ? './img/star.png' : './img/star_unchecked.png';

        //save in idb
        this.state.indexedDB.restaurants
            .where('id')
            .equals(restaurantID)
            .modify({is_favorite: !isFavorite});

        // save in API
        DBHelper.setFavorite(restaurantID, !isFavorite)
            .catch(
                // bg sync if can't
                () => {
                    return new Promise((resolve, reject) => {
                        if (navigator.serviceWorker) {

                            if (reg.sync && reg.sync.getTags) {
                                resolve(
                                    this.state.indexedDB.favoriteRequests
                                        .where('restaurantID')
                                        .equals(restaurantID)
                                        .count(count=>{
                                            if(count===0){
                                                this.state.indexedDB.favoriteRequests
                                                    .put({restaurantID: restaurantID})
                                                    .then(reg.sync.register('syncFavorite'))
                                            }
                                        })

                                );
                            }
                        } else {
                            reject();
                        }
                    })
                }
            )
            //if can't retry when online
            //.retryWhen(() => this.ONLINE$)
            .subscribe()
    };

    /**
     * Update page and map for current restaurants.
     *
     * @return {void}
     */
    updateRestaurants = () => {
        const cSelect = document.getElementById('cuisines-select');
        const nSelect = document.getElementById('neighborhoods-select');

        const cIndex = cSelect.selectedIndex;
        const nIndex = nSelect.selectedIndex;

        const cuisine = cSelect[cIndex].value;
        const neighborhood = nSelect[nIndex].value;
        const DB = this.state.indexedDB;
        // Remove all restaurants
        this.resetRestaurants();
        DBHelper
            .fetchRestaurantByCuisineAndNeighborhood(DBHelper.fetchRestaurants(DB), cuisine, neighborhood)
            .subscribe(
                (r) => {
                    this.storeThumbnails(r);
                    this.addMarkersToMap(r);
                },
                (error) => console.error(error)
            );
    };

    /**
     * Clear current restaurants, their HTML and remove their map markers.
     *
     * @return {void}
     */
    resetRestaurants = () => {
        /* empty array */
        this.state.thumbnails.length = 0;
        const ul = document.getElementById('restaurants-list');
        this.removeFavoriteListeners();
        // Remove all map markers
        this.state.markers = this.state.markers ? this.state.markers : [];
        this.state.markers.forEach(/**@param {google.maps.Marker} m */m => m.setMap(null));
    };

    /**
     * Stores thumbnails HTML to release if
     *
     * {{name: String, neighborhood: String, photograph: String, address: String, latlng: Number,
     * cuisine_type: String, operating_hours: String, reviews: Object}} restaurant - Restaurant Object
     */
    storeThumbnails = (restaurant) => {
        this.state.thumbnails.push({
            HTML: this.createRestaurantHTML(restaurant),
            visible: false,
        });
    };

    /**
     * Create all restaurants HTML and store them for lazy loading
     *
     * {HTMLDivElement} restaurantThumbnail - Restaurant thumbnail
     * @return {void}
     */
    fillRestaurantsHTML = (restaurantThumbnail) => {
        const ul = document.getElementById('restaurants-list');

        try {
            ul.append(restaurantThumbnail);
        } catch (e) {
            ul.innerHTML += restaurantThumbnail.outerHTML; // support for MS Edge
        }

    };
    /**
     * Returns data- attributes
     *
     * @param {NamedNodeMap} attr - attributes of a node
     * @return {Object} object of data attributes
     */
    static getDataAttributes = (attr) => {
        const dataAttributes = [...attr]
            .filter(attribute => /data/.test(attribute.name));
        const data = {};
        for (const i in dataAttributes) {
            const {name, value} = dataAttributes[i];
            data[name.slice(5, name.length)] = value;
        }
        return data;
    };
    /**
     * Generates responsive image HTML
     *
     * @param url {string}
     * @param alt {string}
     * @param {string} prefix - relative prefix to images eg. ./..
     * @return {string}
     */
    static createResponsiveImg = (url, alt, prefix = '.') => {
        const parsedURL = url.split('.');
        const urlWithoutExt = parsedURL[parsedURL.length - 1];
        return `<picture class="restaurant-img">
  <source media="(max-width: 719px)"
    srcset="${prefix + urlWithoutExt}-100-1x.jpg 1x, ${prefix + urlWithoutExt}-100-2x.jpg 2x, ${prefix + urlWithoutExt}-100-3x.jpg 3x">
  <source  media="(min-width: 720px)"
    srcset=".${url}.jpg 1x">
  <img class="restaurant-img" src="${prefix + urlWithoutExt}.jpg" alt="${alt}">
</picture>`;

    };

    /**
     * Create restaurant HTML.
     *
     * @param restaurant {Object}
     * @return {[Node, String]}
     */
    createRestaurantHTML = (restaurant) => {
        const container = document.createElement('div');
        const randomId = 'n' + String(Math.random()).split('.')[1];
        const isFavorite = JSON.parse(typeof restaurant.is_favorite !== "undefined" ? restaurant.is_favorite : "false");
        container.innerHTML = `<li role="listitem" aria-labelledby="${randomId}">
<div id="${randomId}">
<button class="markAsFavorite" aria-label="Mark as favorite" title="Mark as favorite" aria-live="assertive" role="switch" aria-checked="false" data-id="${restaurant.id}" data-favorite="${ isFavorite }">
<img class="star ${isFavorite ? 'favorite' : ''}" src="${isFavorite ? './img/star.png' : './img/star_unchecked.png'}"
 alt="${isFavorite ? 'is favorite' : "isn't favorite"}">
</button>
<h2 role="heading">${restaurant.name}</h2>
<p>${restaurant.neighborhood}</p>
<p>${restaurant.address}</p>
</div>
<a role="link" href="${DBHelper.urlForRestaurant(restaurant)}">View Details</a></li>`
            .replace(/>\s+</, '><'); //just in case browser will render unwanted space

        //returning image as string, otherwise it would be fetched before it should be
        return [
            container.firstChild,
            Restaurant.createResponsiveImg(
                DBHelper.imageUrlForRestaurant(restaurant), `Image of ${restaurant.name} restaurant`
            )
        ];
    };

    /**
     * Add markers for current restaurants to the map.
     * @param {Object} restaurant
     * @return {Function}
     */
    addMarkersToMap = (restaurant) => {
        const marker = DBHelper.mapMarkerForRestaurant(restaurant, this.state.map);
        google.maps.event.addListener(marker, 'click', () => {
            window.location.href = marker.url
        });
        this.state.markers.push(marker);
    };

}

export default Restaurant;
export const createResponsiveImg = Restaurant.createResponsiveImg;
export const getDataAttributes = Restaurant.getDataAttributes;
