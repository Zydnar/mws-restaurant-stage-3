const Twig = require('twig');

/**
 * RestaurantsController
 *
 * @description :: Server-side logic for managing restaurants
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {
    home: function (req, res, next) {
        Twig.renderFile('./views/home.html.twig',
            {
                assetsPrefix: './'
            }, function (err, html) {
                if (err) throw err;
                const nospace = html.replace(/>\s+</g, '><');
                return res.send(nospace);
            })
    },
    review: function (req, res, next) {
        Twig.renderFile(
            './views/restaurant.html.twig',
            {
                assetsPrefix: './../../'
            }, function (err, html) {
                if (err) throw err;
                const nospace = html.replace(/>\s+</g, '><');
                return res.send(nospace);
            }
        )
    }
};

