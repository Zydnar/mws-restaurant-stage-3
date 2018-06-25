import {Observable} from 'rxjs/Observable';
import {AjaxObservable} from 'rxjs/observable/dom/AjaxObservable';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/distinct';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/fromEvent';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/operator/retry';
import 'rxjs/add/operator/retryWhen';
import Dexie from 'dexie';

/**
 * Common database helper functions.
 */
class DBHelper {

    /**
     * Database URL.
     * @description restaurants.json file location on your server.
     * @static
     * @return {String}
     */
    static get API_URL() {
        return '/restaurants/';
    }

    /**
     * Database Name.
     * @description Indexed database name
     * @static
     * @return {String}
     */
    static get DATABASE_NAME() {
        return 'restaurants';
    }

    /**
     * Returns current database number set by developer
     * @static
     * @return {number}
     */
    static get DATABASE_VERSION() {
        return 1;
    }

    /**
     * Returns indexedDB managed by Dexie
     * @param {String} name - Table name
     * @static
     * @return {Dexie}
     */
    static createIndexedDB(name) {
        return new Dexie(name)
    }

    /**
     * Returns Observable of favoriteRequests table
     * @param {Dexie} DB - Dexie DB instance
     * @return {Observable} IndexedDB collection
     */
    static getIndexedFavoriteRequests(DB) {
        return Observable.fromPromise(
            DB.favoriteRequests.toArray()
        ).mergeMap(val => val);
    }

    /**
     * Returns Observable of favoriteRequests table
     * @param {Dexie} DB - Dexie DB instance
     * @return {Observable} IndexedDB collection
     */
    static getIndexedReviewRequests(DB) {
        return Observable.fromPromise(
            DB.reviewRequests.toArray()
        ).mergeMap(val => val);
    }

    /**
     * Returns Observable of restaurants table
     * @param {Dexie} DB - Dexie DB instance
     * @return {Observable} IndexedDB collection
     */
    static getIndexedRestaurants(DB) {
        return Observable.fromPromise(
            DB[DBHelper.DATABASE_NAME].toArray()
        ).mergeMap(val => val);
    }

    /**
     * Returns Observable of restaurants table
     * @param {Dexie} DB - Dexie DB instance
     * @return {Observable} IndexedDB collection
     */
    static getIndexedReviews(DB) {
        return Observable.fromPromise(
            DB.reviews.toArray()
        ).mergeMap(val => val);
    }

    /**
     * Creates indexedDB table
     * @param {Dexie} DB Database
     * @param {Object} stores Stores and object
     * @static
     * @return {Promise<Dexie>}
     */
    static createIndexedStores(DB, stores) {
        return new Promise((resolve, reject) => {
            try {
                return DB.version(DBHelper.DATABASE_VERSION).stores(stores);
            } catch (error) {
                if (error.message === 'Cannot add version when database is open') {
                    DB.close();
                    DB.version(DBHelper.DATABASE_VERSION).stores(stores);
                    return DB.open();
                }
            }
            resolve(DB);
        })
    }

    /**
     * Deletes an indexed database
     * @param {Dexie} DB
     * @static
     * @return {Promise<void>}
     */
    static deleteIndexedDB(DB) {
        return DB.delete();
    }

    /**
     * Executes indexedDB settings and if set, Dexie.on watcher
     * @param {Dexie} DB
     * @static
     * @return {Promise<Dexie>}
     */
    static initIndexedDB(DB) {
        return DB.open();
    }

    /**
     * Registers listener for an indexedDB event
     * @param {Dexie} DB
     * @param {String} type
     * @param {Function} fn
     * @static
     * @return {void}
     */
    static addIDBEventListener(DB, type, fn) {
        DB.on(type, fn);
    }

    /**
     * Executes function if indexedDB is not empty
     * @param {Dexie} DB
     * @static
     * @param {String} storeName
     */
    static ifIndexedDBEmpty(DB, storeName) {
        return new Promise((resolve, reject) => {
                DBHelper.addIDBEventListener(DB, 'ready', () => DB[storeName].count((count) => {
                        if (count === 0) {
                            return resolve();
                        } else {
                            return reject('DB not empty');
                        }
                    })
                )
            }
        );
    }

    /**
     * Executes an callback when having access to indexed table records
     * @param {Dexie} DB
     * @param {Function} callback
     * @static
     * @return {Dexie.Promise}
     */
    static indexedTableOpen(DB, callback) {
        return DB.transaction('rw', DBHelper.DATABASE_NAME, () => {
            return callback();
        })
    }

    /**
     * Fetch all restaurants.
     * @static
     * @param {Dexie} DB - Dexie database
     * @return {Observable}
     */
    static fetchRestaurants(DB) {
        return AjaxObservable.create
            .getJSON(DBHelper.API_URL)
            .retry(2)
            .mergeMap(x => Observable.from(x))
            .catch(() => {
                return DBHelper.getIndexedRestaurants(DB)
            })
    }

    /**
     * Sends ajax request to set restaurant as favorite
     *
     * @param {Number} restaurantID
     * @param {boolean} isFavorite
     * @return {Observable}
     */
    static setFavorite = (restaurantID, isFavorite) => AjaxObservable.create
        .put(`./restaurants/${restaurantID}/?is_favorite=${isFavorite}`);

    /**
     * Gets reviews
     *
     * @param {Number} ID - ID of restaurant
     * @param {''|string} prefix - route depth eg. ../
     * @return {Observable<AjaxResponse>}
     */
    static fetchReviewsByID(ID, prefix = '') {
        return AjaxObservable.create.getJSON(`./${prefix}reviews/?restaurant_id=${ID}`);
    }

    /**
     * Sends new review to API
     *
     * @param {FormData} data
     * @param {''|string} prefix - route depth eg. ../
     * @return {Observable<AjaxResponse>}
     */
    static addReviewByRestaurant(data, prefix = '') {
        return AjaxObservable.create
            .post(`./${prefix}reviews/`, data)
    }

    /**
     * Deletes review by it's ID
     *
     * @param {Number|String} reviewID
     * @param {String} prefix
     * @return {Observable<AjaxResponse>}
     */
    static removeReviewByID(reviewID, prefix = '') {
        return AjaxObservable.create
            .delete(`./${prefix}reviews/${reviewID}`)
    }

    /**
     *
     * @param {Dexie} DB
     * @param {Array} query arguments for indexedDB query id/
     * @return {Promise<Dexie>}
     */
    static entryExists(DB, query) {
        return new Promise((resolve, reject) => {
            DB.transaction('rw', DBHelper.DATABASE_NAME, () => {
                DB[DBHelper.DATABASE_NAME]
                    .get(...query)
                    .then((result) => resolve(result))
                    .catch((err) => {
                        reject(err)
                    })
            })
        })
    }

    /**
     * Checks if API have changed
     * @return {Promise<void>}
     */
    static needsUpdate() {
        return new Promise((resolve, reject) => {
            let http = new XMLHttpRequest();
            http.open('HEAD', url);
            http.onreadystatechange = function () {
                if (this.readyState === this.DONE) {
                    (this.status !== 304 && this.status !== 404) && resolve();
                } else {
                    reject();
                }
            };
            http.send();
        })
    }

    /**
     * Fetch a restaurant by its ID.
     * @param {String} id
     * @param {Dexie} DB
     * @static
     * @return {Observable}
     */
    static fetchRestaurantById(id, DB) {
        return AjaxObservable.create
            .getJSON(`${DBHelper.API_URL}${id}`)
            .catch(() => DBHelper
                .getIndexedRestaurants(DB)
                .filter(x => x.id === Number(id))
            )
    }

    /**
     * Fetch restaurants by a cuisine type with proper error handling.
     * @param {Observable} restaurants$
     * @param {String} cuisine
     * @param {Function} callback
     * @static
     * @return {Subscription}
     */
    static fetchRestaurantByCuisine(restaurants$, cuisine, callback) {
        return restaurants$
            .filter(r => r.cuisine_type === cuisine)
            .subscribe(
                (c) => callback(null, c),
                (error) => callback(error, null)
            );
    }

    /**
     * Fetch restaurants by a neighborhood with proper error handling.
     * @param {Observable} restaurants$
     * @param {String} neighborhood
     * @param {Function} callback
     * @static
     * @return {Subscription}
     */
    static fetchRestaurantByNeighborhood(restaurants$, neighborhood, callback) {
        return restaurants$
            .filter(r => r.neighborhood === neighborhood)
            .subscribe(
                (n) => callback(null, n),
                (error) => callback(error, null)
            );
    }

    /**
     * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
     * @param {Observable} restaurants$
     * @param {String} cuisine
     * @param {String} neighborhood
     * @static
     * @return {Observable}
     */
    static fetchRestaurantByCuisineAndNeighborhood(restaurants$, cuisine, neighborhood) {
        return restaurants$
            .filter((r) => {
                    return (cuisine !== 'all' && r.cuisine_type === cuisine || cuisine === 'all')
                        && (neighborhood !== 'all' && r.neighborhood === neighborhood || neighborhood === 'all')
                }
            );
    }

    /**
     * Fetch all neighborhoods with proper error handling.
     * @param {Observable} restaurants$
     * @static
     * @return {Observable<*>}
     */
    static fetchNeighborhoods(restaurants$) {
        return restaurants$
            .map(r => r.neighborhood)
            .distinct()
    }

    /**
     * Fetch all cuisines with proper error handling.
     * @param {Observable} restaurants$
     * @static
     * @return {Subscription}
     */
    static fetchCuisines(restaurants$) {
        return restaurants$
            .map(r => r.cuisine_type)
            .distinct()
    }

    /**
     * Restaurant page URL.
     * @param {Object} restaurant
     * @static
     * @return {String}
     */
    static urlForRestaurant = (restaurant) => (`./review?id=${restaurant.id}`);

    /**
     * Restaurant image URL.
     * @param {Object} restaurant
     * @static
     * @return {String}
     */
    static imageUrlForRestaurant = (restaurant) => (`./../img/${typeof restaurant.photograph !== "undefined" ? restaurant.photograph : 'placeholder'}`);

    /**
     * Map marker for a restaurant.
     * @param {{name: String, neighborhood: String, photograph: String, address: String, latlng: Number,
     * cuisine_type: String, operating_hours: String, reviews: Object}} restaurant - Restaurant Object
     * @param {google.maps.Map} map
     * @static
     * @return {google.maps.Marker}
     */
    static mapMarkerForRestaurant(restaurant, map) {
        return new google.maps.Marker(
            {
                position: restaurant.latlng,
                title: restaurant.name,
                url: DBHelper.urlForRestaurant(restaurant),
                map: map,
                animation: google.maps.Animation.DROP
            }
        );
    }

}

export default DBHelper;
