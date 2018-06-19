import DBHelper from "./DBHelper";
import {createResponsiveImg, getDataAttributes} from './Restaurant';
import {Observable} from "rxjs/Observable";
import {toast} from "./toast";

class Review {
    constructor(){
        //adding review
        const reviewForm = document.getElementById('review-form');
        reviewForm.addEventListener('submit', (event)=> {
            event.preventDefault();
            const review = document.getElementById('review');
            const rating = document.getElementById('rating');
            const name = document.getElementById('name');
            const restaurantID = routeChecker()[1];
            const data = new FormData();
            data.append('name', name.value);
            data.append('rating', rating.value);
            data.append('comments', review.value);
            data.append('restaurant_id', restaurantID);
            DBHelper.addReviewByRestaurant(data, '../')
                .retryWhen(()=>this.ONLINE$)
                .subscribe();
        });
    }
    /**
     * @type {{restaurant: null|Object, map: null|google.maps.Map, DB: null|Dexie}}
     */
    state = {
        restaurant: null,
        map: null,
        DB: null,
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
    OFFLINE$ = Observable.fromEvent(window, 'offline').subscribe(()=>{
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
            const DB = DBHelper.createIndexedDB(DBHelper.DATABASE_NAME);
            this.setState({DB});
            DBHelper.createIndexedStores(DB, {
                restaurants: 'id++,name,neighborhood,cuisine_type',
                reviews: 'id++,name,restaurant_id,createdAt,updatedAt,rating,comments',
            });
            DBHelper.fetchRestaurantById(id, DB)
                .subscribe((restaurant) => {
                    this.state.restaurant = restaurant;
                    console.log(restaurant);
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
        image.outerHTML = createResponsiveImg(DBHelper.imageUrlForRestaurant(restaurant), `Image of ${restaurant.name} restaurant`, './../..');
        const img = document.getElementsByClassName('restaurant-img')[1];
        img.id = 'restaurant-img';

        const cuisine = document.getElementById('restaurant-cuisine');
        cuisine.innerHTML = restaurant.cuisine_type;
        // fill operating hours
        if (restaurant.operating_hours) {
            this.fillRestaurantHoursHTML();
        }
        // fill reviews
        this.fillReviewsHTML(DBHelper.fetchReviewsByID(this.state.restaurant.id, '../../'));
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
                .retryWhen(()=>this.ONLINE$)
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
        const DB = this.state.DB;
        reviews
            .catch(()=>DBHelper.getIndexedReviews(DB))
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
<p>${review.comments}</p>
<button class="remove-review">X</button><button class="edit-review">edit</button></li>`
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
     * @param url {String=}
     */
    getParameterByName = (url = window.location.pathname) => {
        const results = url.split('/');
        if (!results) {
            return null;
        }
        if (!results[2]) {
            return '';
        }
        return results[2];
    };

}

export default Review;
