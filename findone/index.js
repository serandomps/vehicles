var dust = require('dust')();
var serand = require('serand');
var utils = require('utils');
var Vehicle = require('../service');
var user = require('user');

var locations = require('model-locations');
var Locations = locations.service;

var recent = require('../recent');

var redirect = serand.redirect;

var token;

dust.loadSource(dust.compile(require('./template'), 'model-vehicles-findone'));
dust.loadSource(dust.compile(require('./actions'), 'model-vehicles-findone-actions'));
dust.loadSource(dust.compile(require('./status'), 'model-vehicles-findone-status'));
dust.loadSource(dust.compile(require('./details'), 'model-vehicles-findone-details'));

var findLocation = function (id, done) {
    $.ajax({
        method: 'GET',
        url: utils.resolve('accounts:///apis/v/locations/' + id),
        dataType: 'json',
        success: function (data) {
            done(null, data);
        },
        error: function (xhr, status, err) {
            done(err || status || xhr);
        }
    });
};

var findContact = function (id, done) {
    $.ajax({
        method: 'GET',
        url: utils.resolve('accounts:///apis/v/contacts/' + id),
        dataType: 'json',
        success: function (data) {
            done(null, data);
        },
        error: function (xhr, status, err) {
            done(err || status || xhr);
        }
    });
};

module.exports = function (ctx, container, options, done) {
    var sandbox = container.sandbox;
    Vehicle.findOne({id: options.id, resolution: '800x450'}, function (err, vehicle) {
        if (err) {
            return done(err);
        }
        async.parallel({
            location: function (found) {
                findLocation(vehicle.location, function (ignored, location) {
                    if (location) {
                        location.country = Locations.findCountry(location.country);
                    }
                    found(null, location);
                });
            },
            contact: function (found) {
                findContact(vehicle.contact, function (ignored, contact) {
                    found(null, contact);
                });
            },
            user: function (found) {
                user.findOne(vehicle.user, found);
            }
        }, function (err, o) {
            if (err) {
                return done(err);
            }
            vehicle._.privileged = options.privileged;
            vehicle._.user = o.user;
            vehicle._.contact = o.contact;
            vehicle._.location = o.location;
            if (token && token.user.id === vehicle.user) {
                vehicle._.edit = true;
                vehicle._.bumpable = utils.bumpable(vehicle);
            }
            vehicle._.condition = vehicle.condition.replace(/-/ig, ' ');
            vehicle._.bumped = (vehicle.createdAt !== vehicle.updatedAt);
            vehicle._.offer = utils.capitalize(vehicle.type) + ' for ' + (vehicle.offer === 'sell' ? 'Sale' : 'Rent');
            utils.workflow('model', function (err, workflow) {
                if (err) {
                    return done(err);
                }
                var transitions = workflow.transitions[vehicle.status];
                var status = _.filter(Object.keys(transitions), function (action) {
                    return utils.permitted(ctx.user, vehicle, action);
                });
                vehicle._.status = status.length ? status : null;
                vehicle._.editing = (vehicle.status === 'editing');
                dust.render('model-vehicles-findone', serand.pack(vehicle, container), function (err, out) {
                    if (err) {
                        return done(err);
                    }
                    var elem = sandbox.append(out);
                    locations.findone(ctx, {
                        id: container.id,
                        sandbox: $('.location', elem),
                        parent: elem
                    }, {
                        required: true,
                        label: 'Location of the vehicle',
                        id: vehicle.location
                    }, function (ignored, o) {
                        recent(ctx, {
                            id: container.id,
                            sandbox: $('.recent', elem)
                        }, {}, function (err, o) {
                            if (err) {
                                return done(err);
                            }
                            elem.on('click', '.status-buttons .dropdown-item', function () {
                                utils.loading();
                                var action = $(this).data('action');
                                utils.transit('autos', 'vehicles', vehicle.id, action, function (err) {
                                    utils.loaded();
                                    if (err) {
                                        return console.error(err);
                                    }
                                    if (action === 'edit') {
                                        return redirect('/vehicles/' + vehicle.id + '/edit');
                                    }
                                    redirect('/vehicles/' + vehicle.id);
                                });
                                return false;
                            });
                            elem.on('click', '.bumpup', function () {
                                utils.loading();
                                utils.bumpup('autos', 'vehicles', vehicle.id, function (err) {
                                    utils.loaded();
                                    if (err) {
                                        return console.error(err);
                                    }
                                    redirect('/vehicles/' + vehicle.id);
                                });
                            });
                            done(null, {
                                clean: function () {
                                    $('.model-vehicles-findone', sandbox).remove();
                                },
                                ready: function () {
                                    var i;
                                    var o = [];
                                    var images = vehicle._.images;
                                    var length = images.length;
                                    var image;
                                    for (i = 0; i < length; i++) {
                                        image = images[i];
                                        o.push({
                                            href: image.url,
                                            thumbnail: image.url
                                        });
                                    }
                                    blueimp.Gallery(o, {
                                        container: $('.blueimp-gallery-carousel', sandbox),
                                        carousel: true,
                                        thumbnailIndicators: true,
                                        stretchImages: true
                                    });
                                }
                            });
                        });
                    });
                });
            });
        });
    });
};

utils.on('user', 'ready', function (tk) {
    token = tk;
});

utils.on('user', 'logged in', function (tk) {
    token = tk;
});

utils.on('user', 'logged out', function (tk) {
    token = null;
});
