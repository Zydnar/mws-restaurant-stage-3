import DBHelper from './DBHelper';
import {Observable} from 'rxjs/Observable';
import {Subject} from 'rxjs/Subject';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/operator/filter';
import "regenerator-runtime/runtime";
//import "serviceworker-cache-polyfill";

const CACHE_NAME = "v1";
const ONLINE$ = new Subject();
(async () => {
    let online = true;
    setInterval(() => {
        if (navigator.onLine !== online) {
            ONLINE$.next(navigator.onLine);
            online = navigator.onLine;
        }
    }, 500);
})();
const DB = DBHelper.createIndexedDB(DBHelper.DATABASE_NAME);
DBHelper.createIndexedStores(DB, {
    restaurants: 'id++,name,neighborhood,cuisine_type',
    reviews: 'id++,name,restaurant_id,createdAt,updatedAt,rating,comments',
    favoriteRequests: 'id++,restaurantID',
    reviewRequests: 'id++,reviewID',
}).then((db) => {
        //after reload check if there is still something to sync
        db.favoriteRequests.count(count => {
            if (count > 0) {
                return syncFavorites();
            }
        });

        db.reviewRequests.count(count => {
            if (count > 0) {
                return syncReviews();
            }
        });
    }
);

/**
 * Deletes caches not matching cache_name
 *
 * @param {ExtendableEvent} event
 */
const delete_caches = (event) => event
    .waitUntil(
        caches.keys()
            .then(cacheNames => cacheNames
                .filter(cacheName => cacheName !== CACHE_NAME)
                .map(cacheName => caches.delete(cacheName))
            )
    );

/**
 * Tries set restaurant as favorite in API if can't retries when !!navigator.onLine
 *
 * @return {Promise<*>}
 */
const syncFavorites = () => new Promise((resolve, reject) => {
    DBHelper
        .getIndexedFavoriteRequests(DB)
        .mergeMap(req => Observable
            .fromPromise(
                new Promise((resolve, reject) => {
                        DB.restaurants
                            .where('id')
                            .equals(req.restaurantID)
                            .first(restaurant => resolve(restaurant));
                    }
                )
            )
        )
        .subscribe(restaurant => {
                Observable.fromPromise(fetch(`./restaurants/${restaurant.id}/?is_favorite=${restaurant.is_favorite}`, {
                    method: 'PUT'
                }))
                    .retryWhen(() => ONLINE$.filter(online => online))
                    .subscribe(
                        () => {
                        },
                        err => reject(err),
                        () => {
                            DB.favoriteRequests
                                .where('restaurantID')
                                .equals(restaurant.id)
                                .delete();
                        }
                    );
            },
            err => reject(err),
            () => resolve()
        )
});

/**
 * Tries sent review in API if can't retries when !!navigator.onLine
 *
 * @return {Promise<*>}
 */
const syncReviews = () => new Promise((resolve, reject) => {
    DBHelper
        .getIndexedReviewRequests(DB)
        .mergeMap(rev => {
                return Observable.fromPromise(
                    new Promise((resolve, reject) => {
                        DB.reviews
                            .get(Number(rev.reviewID))
                            .then(resolve)
                            .catch(reject)
                    })
                )
            }
        )
        .subscribe(review => {
                const form_data = new FormData();

                for ( const key in review ) {
                    form_data.append(key, review[key]);
                }
                Observable.fromPromise(
                    fetch(`./reviews/`, {
                        method: 'POST',
                        body: form_data,
                    })
                )
                    .retryWhen(() => ONLINE$.filter(online => online))
                    .subscribe(
                        undefined,
                        err => reject(err),
                        () => {
                            DB.reviewRequests
                                .where('id')
                                .equals(review.id)
                                .delete();
                        }
                    )

            },
            err => reject(err),
            () => resolve()
        )
});

addEventListener('install', (event) => {
    const initRequest = {
        credentials: "omit",
        headers: {},
        referrer: "http://localhost:1337/",
        referrerPolicy: "no-referrer-when-downgrade",
        body: null,
        method: "GET",
        mode: "no-cors"
    };
    const mapsReq = new Request('https://maps.googleapis.com/maps/api/js?key=AIzaSyCZyUeaJZv0dXSBsJqALEkJmS5nKRZJDuY&libraries=places&callback=initMap',
        initRequest);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => Promise.all([
                    cache.addAll(
                        [
                            '/',
                            '/review',
                            '/img/star.png',
                            '/img/star_unchecked.png',
                            '/img/placeholder.jpg',
                            '/img/placeholder-100-1x.jpg',
                            '/img/placeholder-100-2x.jpg',
                            '/img/placeholder-100-3x.jpg',
                            '/sw.js',
                            '/js/main.js',
                            '/css/styles.css',
                            'https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.0/normalize.min.css',
                        ]
                    ),
                    fetch(mapsReq).then(r => cache.put(mapsReq, r)),
                    (() => {
                        return Promise.all(
                            [
                                'https://maps.googleapis.com/maps-api-v3/api/js/33/5/intl/pl_ALL/common.js',
                                'https://maps.googleapis.com/maps-api-v3/api/js/33/5/intl/pl_ALL/util.js',
                                'https://maps.googleapis.com/maps-api-v3/api/js/33/5/intl/pl_ALL/map.js',
                                'https://maps.googleapis.com/maps-api-v3/api/js/33/5/intl/pl_ALL/marker.js',
                                'https://maps.googleapis.com/maps-api-v3/api/js/33/5/intl/pl_ALL/stats.js',
                                'https://maps.googleapis.com/maps-api-v3/api/js/33/5/intl/pl_ALL/onion.js',
                                'https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2.png',
                                'https://maps.gstatic.com/mapfiles/openhand_8_8.cur',
                                'https://maps.gstatic.com/mapfiles/transparent.png',
                                'https://maps.googleapis.com/maps/api/js/ViewportInfoService.GetViewportInfo?1m6&1m2&1d40.55965355640603&2d-74.93700426125827&2m2&1d40.88229899141979&2d-73.04276332020981&2u12&4spl-PL&5e0&6sm%40426000000&7b0&8e0&callback=_xdc_._yz6io7&token=10959',
                                'https://maps.googleapis.com/maps/api/js/AuthenticationService.Authenticate?1shttp%3A%2F%2Flocalhost%3A1337%2F&4sAIzaSyCZyUeaJZv0dXSBsJqALEkJmS5nKRZJDuY&callback=_xdc_._n5k7dh&token=19812'
                            ].map(url => fetch(url, initRequest)
                                .then(r => cache.put((new Request(url, initRequest)), r))
                            )
                        )
                    })()
                ])
            )
    );
});

addEventListener('activate', (event) => {
    return delete_caches(event);
});

addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request, {ignoreSearch: true, ignoreVary: true})
            .then((response) => {
                // comments from Mozilla MDN
                // caches.match() always resolves
                // but in case of success response will have value
                if (response !== void 0) {
                    return response;
                } else {
                    return fetch(event.request)
                        .then((response) => {
                            let responseClone;
                            // response may be used only once
                            // we need to save clone to put one copy in cache
                            // and serve second one
                            if (response && response.url) {
                                responseClone = response.clone();
                                const splited = responseClone.url.split('/');
                                const file = splited[splited.length - 1];
                                if (file === 'undefined.jpg') {
                                    //return default image if not present
                                    return caches.match('/img/placeholder.jpg').then((r) => {
                                        if (r) return r;
                                    });
                                } else if (splited[splited.length - 2] === 'restaurants' || splited[splited.length - 2] === 'reviews') {
                                    //do not cache API
                                    return responseClone;
                                } else if (event.request.method !== 'PUT' && event.request.method !== 'DELETE') {
                                    caches
                                        .open(CACHE_NAME)
                                        .then((cache) => cache.put(event.request, responseClone));
                                    caches.match(event.request).then((r) => {
                                        if (r) return r;
                                    });
                                }
                            }
                            return response;
                        }).catch((err) => {
                            console.error(err);
                            return new Response('404 failed', {
                                status: 404,
                                statusText: 'Not found'
                            });
                        });
                }
            }));
});

addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        return this.skipWaiting();
    }
});


addEventListener('sync', (event) => {
    if (event.tag === 'syncFavorite') {
        return event.waitUntil(syncFavorites());
    } else if (event.tag === 'syncReview') {
        return event.waitUntil(syncReviews());
    }
});

