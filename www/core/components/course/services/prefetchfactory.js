// (C) Copyright 2015 Martin Dougiamas
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

angular.module('mm.core.course')

/**
 * Factory to create module prefetch handlers.
 *
 * @module mm.core.course
 * @ngdoc service
 * @name $mmPrefetchFactory
 */
.factory('$mmPrefetchFactory', function($mmSite, $mmFilepool, $mmUtil, $q) {

    var self = {},
        modulePrefetchHandler = (function () {

            this.component = 'core_res';

            /**
             * Download the module.
             *
             * @param  {Object} module    The module object returned by WS.
             * @param  {Number} courseId  Course ID.
             * @return {Promise}          Promise resolved when all content is downloaded. Data returned is not reliable.
             */
            this.download = function(module, courseId) {
                return this.downloadOrPrefetch(module, courseId, false);
            };

            /**
             * Download or prefetch the content.
             *
             * @param  {Object} module    The module object returned by WS.
             * @param  {Number} courseId  Course ID.
             * @param  {Boolean} prefetch True to prefetch, false to download right away.
             * @param  {String} [dirPath] Path of the directory where to store all the CONTENT files. This is to keep the files
             *                            relative paths and make the package work in an iframe. Undefined to download the files
             *                            in the filepool root folder.
             * @return {Promise}          Promise resolved when all content is downloaded. Data returned is not reliable.
             */
            this.downloadOrPrefetch = function(module, courseId, prefetch, dirPath) {
                var siteId = $mmSite.getId(),
                    that = this;

                // Get the intro files.
                return that.getIntroFiles(module, courseId).then(function(introFiles) {
                    // Get revision and timemodified.
                    return that.getRevisionAndTimemodified(module, courseId, introFiles).then(function(data) {
                        var downloadFn = prefetch ? $mmFilepool.prefetchPackage : $mmFilepool.downloadPackage,
                            contentFiles = that.getContentDownloadableFiles(module),
                            promises = [];

                        if (dirPath) {
                            // Download intro files in filepool root folder.
                            angular.forEach(introFiles, function(file) {
                                if (prefetch) {
                                    promises.push($mmFilepool.addToQueueByUrl(siteId, file.fileurl,
                                            that.component, module.id, file.timemodified));
                                } else {
                                    promises.push($mmFilepool.downloadUrl(siteId, file.fileurl, false,
                                            that.component, module.id, file.timemodified));
                                }
                            });

                            // Download content files inside dirPath.
                            promises.push(downloadFn(siteId, contentFiles, that.component,
                                    module.id, data.revision, data.timemod, dirPath));
                        } else {
                            // No dirPath, download everything in filepool root folder.
                            var files = introFiles.concat(contentFiles);
                            promises.push(downloadFn(siteId, files, that.component, module.id, data.revision, data.timemod));
                        }

                        return $q.all(promises);
                    });
                });
            };

            /**
             * Returns a list of content files that can be downloaded.
             *
             * @param {Object} module The module object returned by WS.
             * @return {Object[]}     List of files.
             */
            this.getContentDownloadableFiles = function(module) {
                var files = [],
                    that = this;

                angular.forEach(module.contents, function(content) {
                    if (that.isFileDownloadable(content)) {
                        files.push(content);
                    }
                });

                return files;
            };

            /**
             * Get the download size of a module.
             *
             * @param  {Object} module   Module to get the size.
             * @param  {Number} courseId Course ID.
             * @return {Promise}         Promise resolved with file size and a boolean to indicate if it is the total size or
             *                           only partial.
             */
            this.getDownloadSize = function(module, courseId) {
                return this.getFiles(module, courseId).then(function(files) {
                    return $mmUtil.sumFileSizes(files);
                });
            };

            /**
             * Get the downloaded size of a module.
             *
             * @param {Object} module   Module to get the downloaded size.
             * @param {Number} courseId Course ID the module belongs to.
             * @return {Promise}        Promise resolved with the size.
             */
            this.getDownloadedSize = function(module, courseId) {
                return $mmFilepool.getFilesSizeByComponent($mmSite.getId(), this.component, module.id);
            };

            /**
             * Get event names of content files being downloaded.
             *
             * @param {Object} module The module object returned by WS.
             * @return {Promise}      Resolved with an array of event names.
             */
            this.getDownloadingFilesEventNames = function(module) {
                var promises = [],
                    eventNames = [],
                    siteId = $mmSite.getId(),
                    that = this;

                angular.forEach(module.contents, function(content) {
                    var url = content.fileurl;
                    if (!that.isFileDownloadable(content)) {
                        return;
                    }

                    promises.push($mmFilepool.isFileDownloadingByUrl(siteId, url).then(function() {
                        return $mmFilepool.getFileEventNameByUrl(siteId, url).then(function(eventName) {
                            eventNames.push(eventName);
                        });
                    }).catch(function() {
                        // Ignore fails.
                    }));
                });

                return $q.all(promises).then(function() {
                    return eventNames;
                });
            };

            /**
             * Returns a list of content file event names.
             *
             * @param {Object} module The module object returned by WS.
             * @return {Promise}      Promise resolved with array of event names.
             */
            this.getFileEventNames = function(module) {
                var promises = [],
                    siteId = $mmSite.getId(),
                    that = this;

                angular.forEach(module.contents, function(content) {
                    var url = content.fileurl;
                    if (!that.isFileDownloadable(content)) {
                        return;
                    }

                    promises.push($mmFilepool.getFileEventNameByUrl(siteId, url));
                });

                return $q.all(promises);
            };

            /**
             * Get the list of downloadable files.
             *
             * @param {Object} module   Module to get the files.
             * @param {Number} courseId Course ID the module belongs to.
             * @return {Promise}        Promise resolved with the list of files.
             */
            this.getFiles = function(module, courseId) {
                var that = this;
                return that.getIntroFiles(module, courseId).then(function(files) {
                    return files.concat(that.getContentDownloadableFiles(module));
                });
            };

            /**
             * Returns module intro files.
             *
             * @param  {Object} module   The module object returned by WS.
             * @param  {Number} courseId Course ID.
             * @return {Promise}         Promise resolved with list of intro files.
             */
            this.getIntroFiles = function(module, courseId) {
                return $q.when(this.getIntroFilesFromInstance(module));
            };

            /**
             * Returns module intro files from instance.
             *
             * @param  {Object} module     The module object returned by WS.
             * @param  {Object} [instance] The instance to get the intro files (book, assign, ...). If not defined,
             *                             module will be used.
             * @return {Object[]}          List of intro files.
             */
            this.getIntroFilesFromInstance = function(module, instance) {
                if (instance) {
                    if (typeof instance.introfiles != 'undefined') {
                        return instance.introfiles;
                    } else if (instance.intro) {
                        return $mmUtil.extractDownloadableFilesFromHtmlAsFakeFileObjects(instance.intro);
                    }
                }

                if (module.description) {
                    return $q.when($mmUtil.extractDownloadableFilesFromHtmlAsFakeFileObjects(module.description));
                }

                return [];
            };

            /**
             * Get revision of a module.
             *
             * @param {Object} module   Module to get the revision.
             * @param {Number} courseId Course ID the module belongs to.
             * @return {Promise}        Promise resolved with revision.
             */
            this.getRevision = function(module, courseId) {
                return this.getRevisionAndTimemodified(module, courseId).then(function(data) {
                    // By default, don't attach a hash of intro files to the revision because, in resources,
                    // updating the module description modifies the revision or timemodified of the content.
                    return data.revision;
                });
            };

            /**
             * Returns module revision and timemodified.
             *
             * @param  {Object} module         The module object returned by WS.
             * @param  {Number} courseId       Course ID.
             * @param  {Object[]} [introFiles] List of intro files. If undefined, they will be calculated.
             * @return {Promise}               Promise resolved with revision and timemodified.
             */
            this.getRevisionAndTimemodified = function(module, courseId, introFiles) {
                // Get the intro files if needed.
                var promise = introFiles ? $q.when(introFiles) : this.getIntroFiles(module, courseId);
                return promise.then(function(files) {
                    // Add all the module contents since some non-downloadable content can have revision/timemodified.
                    files = files.concat(module.contents);

                    return {
                        timemod: $mmFilepool.getTimemodifiedFromFileList(files),
                        revision: $mmFilepool.getRevisionFromFileList(files)
                    };
                });
            };

            /**
             * Get timemodified of a module.
             *
             * @param {Object} module   Module to get the timemodified.
             * @param {Number} courseId Course ID the module belongs to.
             * @return {Promise}        Promise resolved with timemodified.
             */
            this.getTimemodified = function(module, courseId) {
                return this.getRevisionAndTimemodified(module, courseId).then(function(data) {
                    return data.timemod;
                });
            };

            /**
             * Invalidate the prefetched content.
             *
             * @param {Object} moduleId The module ID.
             * @return {Promise}
             */
            this.invalidateContent = function(moduleId) {
                return $mmFilepool.invalidateFilesByComponent($mmSite.getId(), this.component, moduleId);
            };

            /**
             * Check if a module is downloadable.
             *
             * @param {Object} module    Module to check.
             * @param {Number} courseId  Course ID the module belongs to.
             * @return {Promise}         Promise resolved with true if downloadable, resolved with false otherwise.
             */
            this.isDownloadable = function(module, courseId) {
                return $q.when(module.contents.length > 0);
            };

            /**
             * Whether or not the module is enabled for the site.
             *
             * @return {Boolean} True if enabled, false otherwise.
             */
            this.isEnabled = function() {
                return $mmSite.canDownloadFiles();
            };

            /**
             * Check if a file is downloadable.
             *
             * @param {Object} file File to check.
             * @return {Boolean}    True if downloadable, false otherwise.
             */
            this.isFileDownloadable = function(file) {
                return file.type === 'file';
            };

            /**
             * Prefetch the module.
             *
             * @param  {Object} module   The module object returned by WS.
             * @param  {Number} courseId Course ID the module belongs to.
             * @param  {Boolean} single  True if downloading a single module, false if downloading a whole section.
             * @return {Promise}         Promise resolved when all files have been downloaded. Data returned is not reliable.
             */
            this.prefetchContent = function(module, courseId, single) {
                return this.downloadOrPrefetch(module, courseId, true);
            };

            /**
             * Remove module downloaded files.
             *
             * @param {Object} module   Module to remove the files.
             * @param {Number} courseId Course ID the module belongs to.
             * @return {Promise}        Promise resolved when done.
             */
            this.removeFiles = function(module, courseId) {
                return $mmFilepool.removeFilesByComponent($mmSite.getId(), this.component, module.id);
            };

            return this;
        }());

    /**
     * Returns the subclass of modulePrefetchHandler object.
     *
     * @module mm.core
     * @ngdoc method
     * @name $mmPrefetchFactory#createPrefetchHandler
     * @param  {String} component Component of the module.
     * @return {Object}           Child object of modulePrefetchHandler.
     */
    self.createPrefetchHandler = function(component) {
        var child = Object.create(modulePrefetchHandler);
        child.component = component;
        return child;
    };

    return self;
});
