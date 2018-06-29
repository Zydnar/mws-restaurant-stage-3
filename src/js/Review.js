import DBHelper from "./DBHelper";
import {createResponsiveImg, getDataAttributes} from './Restaurant';
import {Observable} from "rxjs/Observable";
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/fromEvent';
import 'rxjs/add/operator/toArray';
import {toast} from "./toast";

class Review {
    constructor() {
        //adding review
        const reviewForm = document.getElementById('review-form');
        reviewForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const review = document.getElementById('review');
            const rating = document.getElementById('rating');
            const name = document.getElementById('name');
            const restaurantID = this.getParameterByName();
            const data = new FormData();
            data.append('name', name.value);
            data.append('rating', rating.value);
            data.append('comments', review.value);
            data.append('restaurant_id', restaurantID);
            const rev = {
                name: name.value,
                rating: rating.value,
                comments: review.value,
                createdAt: (new Date()),
                updatedAt: (new Date()),
                restaurant_id: restaurantID,
            };
            //show added review immediately
            const ul = document.getElementById('reviews-list');
            ul.appendChild(this.createReviewHTML(rev));
            //add to idb
            this.state.indexedDB.reviews.put(rev).then(revID => {
                //send to API
                return DBHelper.addReviewByRestaurant(data, '../')
                    .catch(
                        // leave it to bg sync
                        () => {
                            return new Promise((resolve, reject) => {
                                if (navigator.serviceWorker) {
                                    const reg = window.reg;

                                    if (reg.sync && reg.sync.getTags) {
                                        resolve(
                                            this.state.indexedDB.reviewRequests
                                                .put({reviewID: revID})
                                                .then(reg.sync.register('syncReview')));
                                    }
                                } else {
                                    reject();
                                }
                            });
                        }
                    )
                    //retry when online
                    //.retryWhen(()=>this.ONLINE$)
                    .subscribe();
            }).catch(console.error);
            // form can be reset now
            reviewForm.reset();
        });
    }

    /**
     * @type {{restaurant: null|Object, map: null|google.maps.Map, indexedDB: null|Dexie}}
     */
    state = {
        restaurant: null,
        map: null,
        indexedDB: null,
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

    setState = (obj) => {
        return this.state = {
            ...this.state,
            ...obj,
        }
    };
    /**
     * Get current restaurant from page URL.
     *
     * @param callback {function}
     * @return {void}
     */
    fetchRestaurantFromURL = (callback) => {
        const DB = DBHelper.createIndexedDB(DBHelper.DATABASE_NAME);
        this.setState({indexedDB: DB});
        DBHelper.createIndexedStores(DB, {
            restaurants: 'id++,name,neighborhood,cuisine_type',
            reviews: 'id++,name,restaurant_id,createdAt,updatedAt,rating,comments',
            favoriteRequests: 'id++,restaurantID',
            reviewRequests: 'id++,reviewID',
        });
        if (this.state.restaurant) {
            // restaurant already fetched!
            callback(null, this.state.restaurant);
            return;
        }
        const id = this.getParameterByName();
        if (!id) {
            // ID not found in URL
            const error = 'No restaurant id in URL';
            callback(error, null);
        } else {
            DBHelper.fetchRestaurantById(id, DB)
                .subscribe((restaurant) => {
                    this.state.restaurant = restaurant;
                    DB[DBHelper.DATABASE_NAME].put(restaurant)
                        .catch(console.error);
                    callback(undefined, restaurant);
                    this.fillRestaurantHTML(restaurant);
                }, (error) => {
                    console.error(`Got error ${error} fetching restaurant ID: {${id}} from remote`);
                });
        }
    };

    /**
     * Create restaurant HTML and add it to the webpage
     * @param restaurant {Object}
     * @return {void}
     */
    fillRestaurantHTML = (restaurant = this.state.restaurant) => {
        const name = document.getElementById('restaurant-name');
        name.innerHTML = restaurant.name;

        const address = document.getElementById('restaurant-address');
        address.innerHTML = restaurant.address;

        const image = document.getElementById('restaurant-img');
        image.outerHTML = createResponsiveImg(DBHelper.imageUrlForRestaurant(restaurant), `Image of ${restaurant.name} restaurant`, './..');
        const img = document.getElementsByClassName('restaurant-img')[1];
        img.id = 'restaurant-img';

        const cuisine = document.getElementById('restaurant-cuisine');
        cuisine.innerHTML = restaurant.cuisine_type;
        // fill operating hours
        if (restaurant.operating_hours) {
            this.fillRestaurantHoursHTML();
        }
        const DB = this.state.indexedDB;
        DB.reviews
            .count(count => {
                // fill reviews
                //todo can be done earlier and parallel using Observable.if instead of repeating code
                if (count === 0) {
                    this.fillReviewsHTML(
                        // if indedDB table is not yet populated (assuming API has at least one record)
                        DBHelper.fetchReviewsByID(this.state.restaurant.id, '../../')
                    );
                } else {
                    // otherwise always get indexed values - so this means offline-first
                    this.fillReviewsHTML(
                        DBHelper.getIndexedReviews(DB).toArray()
                    );
                }
            });
    };

    /**
     * Create restaurant operating hours HTML table and add it to the webpage.
     *
     * @param operatingHours {Object}
     */
    fillRestaurantHoursHTML = (operatingHours = this.state.restaurant.operating_hours) => {
        const hours = document.getElementById('restaurant-hours');
        for (let key in operatingHours) {
            const row = document.createElement('tr');

            const day = document.createElement('td');
            day.innerHTML = key;
            row.appendChild(day);

            const time = document.createElement('td');
            time.innerHTML = operatingHours[key];
            row.appendChild(time);

            hours.appendChild(row);
        }
    };

    /**
     *
     * @param {HTMLElement|Node} element
     * @param {Number|String} reviewID
     * @return {void}
     */
    addRemoveReviewListener(element, reviewID) {
        element.addEventListener('click', (event) => {
            event.preventDefault();
            DBHelper.removeReviewByID(reviewID, '../../')
                .retryWhen(() => this.ONLINE$)
                .subscribe();
        });
    }

    /**
     * Create all reviews HTML and add them to the webpage.
     *
     * @param reviews {Observable<Array>} - Stream of fetched array with reviews
     */
    fillReviewsHTML = (reviews) => {
        const container = document.getElementById('reviews-container');
        const title = document.createElement('h3');
        title.innerHTML = 'Reviews';
        container.appendChild(title);

        if (!reviews) {
            const noReviews = document.createElement('p');
            noReviews.innerHTML = 'No reviews yet!';
            container.appendChild(noReviews);
            return;
        }
        const ul = document.getElementById('reviews-list');
        const DB = this.state.indexedDB;
        reviews
            .catch(() => DBHelper.getIndexedReviews(DB).toArray())
            .mergeMap(x => Observable.from(x))
            .subscribe(review => {
                    ul.appendChild(this.createReviewHTML(review));
                    DB.reviews.put(review)
                        .catch(console.error);
                },
                err => {
                    console.error(err);
                },
                () => {
                    //on complete
                    container.appendChild(ul);
                    [...ul.children].map((element) => {
                        const {review_id} = getDataAttributes(element.attributes);
                        this.addRemoveReviewListener(element, review_id)
                    });
                    const m = document.getElementById('maincontent');
                    const o = document.getElementById('overlay');
                    m.style.visibility = 'visible';
                    o.style.display = 'none';
                });

    };

    /**
     * Create review HTML and add it to the webpage.
     * @param {{name: String, rating: String, comments: String, restaurant_id: String, createdAt: String,
     * updatedAt: String, id: Number }} review
     */
    createReviewHTML = (review) => {
        const date = (new Date(review.updatedAt)).toLocaleDateString();
        const container = document.createElement('div');
        container.innerHTML = `<li data-review_id="${review.id}"><p>${review.name}</p>
<p>${date}</p>
<p class="review-rating">Rating: ${review.rating}</p>
<p>${review.comments}</p></li>`
            .replace(/>\s+</, '><');

        return container.firstChild;
    };

    /**
     * Add restaurant name to the breadcrumb navigation menu
     * @param restaurant {Object}
     */
    fillBreadcrumb = (restaurant = this.state.restaurant) => {
        const breadcrumb = document.getElementById('breadcrumb');
        const li = document.createElement('li');
        li.innerHTML = ` ${restaurant.name}`;
        breadcrumb.appendChild(li);
    };

    /**
     * Get a parameter by name from page URL.
     * @param {String=} name
     * @param url {String=}
     */
    getParameterByName = (name = 'id', url = window.location.href) => {
        if (!url) url = window.location.href;
        const parsedName = name.replace(/[\[\]]/g, "\\$&");
        const regex = new RegExp("[?&]" + parsedName + "(=([^&#]*)|&|#|$)"),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    };

}

export default Review;
