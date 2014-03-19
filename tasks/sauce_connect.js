/**
 * `grunt-sauce-connect-launcher`
 *
 * Grunt task utilizing [sauce-connect-launcher](https://github.com/bermi/sauce-connect-launcher) to download and launch Sauce Labs [Sauce Connect](https://saucelabs.com/docs/connect).
 *
 * Copyright (c) 2014 Steffen Eckardt
 * Licensed under the MIT license.
 *
 * @see https://github.com/seckardt/grunt-sauce-connect-launcher
 * @see https://github.com/bermi/sauce-connect-launcher
 */
'use strict';

module.exports = function (grunt) {
	var launcher = require('sauce-connect-launcher'),
		_ = require('lodash'),
		q = require('q'),
		request = require('request').defaults({jar: false, json: true}),
		tunnel = {};

	grunt.registerMultiTask('sauce_connect', 'Grunt plug-in to download and launch Sauce Labs Sauce Connect', function () {
		var options = tunnel.options = this.options({
				tunnelIdentifier: 'Tunnel' + new Date().getTime(),
				verbose: grunt.option('verbose') === true,
				logger: grunt.verbose.writeln
			}),
			done = this.async();

		var tunnelId = options.tunnelIdentifier,
			userName = options.username;
		grunt.log.writeln('Open'.cyan + ' Sauce Connect tunnel: ' + tunnelId.cyan);

		// Create base URL for Sauce Labs REST API calls
		tunnel.baseUrl = ['https://', userName, ':', options.accessKey, '@saucelabs.com', '/rest/v1/', userName].join('');

		launcher(options, function (err, process) {
			if (err) {
				launcher.kill(function () {
					err = err.error || (err.message || String(err));
					grunt.fatal('Failed to open Sauce Connect tunnel: ' + err);
				});
			}

			grunt.log.writeln('Opened'.green + ' Sauce Connect tunnel: ' + tunnelId.cyan);
			tunnel.process = process;
			done();
		});
	});

	grunt.registerTask('sauce-connect-close', 'Closes the current Sauce Connect tunnel', function () {
		var done = this.async();

		function obtainMachines() {
			var deferred = q.defer();
			request.get(tunnel.baseUrl + '/tunnels', function (err, resp, body) {
				if (err) {
					deferred.reject(err);
				} else {
					deferred.resolve(body);
				}
			});
			return deferred.promise;
		}

		function obtainMachine(tunnelIds) {
			var deferred = q.defer(),
				responses = 0,
				resolved = false;

			_.every(tunnelIds, function (tunnelId) {
				request.get(tunnel.baseUrl + '/tunnels/' + tunnelId, function (err, resp, body) {
					responses++;
					if (err) {
						deferred.reject(err);
					} else if (body && body.tunnel_identifier === tunnel.options.tunnelIdentifier) {
						resolved = true;
						deferred.resolve(body);
					} else if (responses === tunnelIds.length) {
						deferred.reject('Failed to obtain Sauce Connect tunnel');
					}
				});
				return !resolved;
			});

			return deferred.promise;
		}

		function killMachine(tunnelData) {
			var deferred = q.defer(),
				tunnelId = tunnelData.id || tunnelIdentifier;

			grunt.log.writeln('Stop'.cyan + ' Sauce Connect machine: ' + tunnelId.cyan);

			request.del(tunnel.baseUrl + '/tunnels/' + tunnelId, function (err, resp, body) {
				if (err || !body || body.result !== true) {
					grunt.log.writeln('Failed'.red + ' to stop Sauce Connect machine: ' + tunnelId.cyan);
				} else {
					grunt.log.writeln('Stopped'.green + ' Sauce Connect machine: ' + tunnelId.cyan);
				}
				deferred.resolve();
			});

			return deferred.promise;
		}

		if (tunnel.process) {
			var tunnelIdentifier = tunnel.options.tunnelIdentifier;
			grunt.log.writeln('Close'.cyan + ' Sauce Connect tunnel: ' + tunnelIdentifier.cyan);

			obtainMachines()
				.then(obtainMachine)
				.then(killMachine)
				.fin(function () {
					tunnel.process.close(function () {
						grunt.log.writeln('Closed'.green + ' Sauce Connect tunnel: ' + tunnelIdentifier.cyan);
						done();
					});
				});
		} else {
			grunt.log.writeln('Close'.cyan + ' current Sauce Connect tunnel');
			launcher.kill(function () {
				grunt.log.writeln('Closed'.green + ' current Sauce Connect tunnel');
				done();
			});
		}
	});
};