var app = angular.module('app', ['angularMoment']);

app.controller('crawler', ['$scope', '$timeout', function($scope, $timeout) { 
    window.$scope = $scope;

    $scope.online = false;

    $scope.socket = io.connect();

    $scope.socket.on('hello-ok', function(data) {
        $timeout(function() {
            if (data.crawls)
                $scope.crawls = data.crawls;
            if (data.appid)
                $scope.appid = data.appid;
            $scope.online = true;
            $scope.socket.emit('load');
        }, 0);
    });

    $scope.socket.on('add-ok', function(data) {
        $timeout(function() {
            if (data.crawlid) {
                $scope.addCrawl(data);
            }
            $scope.watchCrawlId = '';
        }, 0);
    });

    $scope.socket.on('remove-ok', function(data) {
        $timeout(function() {
            if (data.crawlid) {
                $scope.removeCrawl(data);
            }
        }, 0);
    });

    $scope.socket.on('crawl-ok', function(data) {
        $timeout(function() {
            if (data.crawlid) {
                $scope.addCrawl(data);
            }
            $scope.initCrawl();
        }, 0);
    });

    $scope.socket.on('message', function(data) {
        $timeout(function() {
            for (var ii = 0; ii < $scope.crawls.length; ii++) {
                if ($scope.crawls[ii].crawlid == data.crawlid) {
                    data.timestamp = new Date(data.ts);
                    $scope.crawls[ii].messages.push(data);
                }
            }
        }, 0);
    });

    $scope.initCrawl = function() {
        $scope.newCrawl = {
            url: 'http://',
            depth: 0,
            crawlid: uuid4(),
        };
    };

    $scope.watchCrawl = function(crawl) {
        if (!crawl.appid && !crawl.crawlid)
            return;
        crawl.messages = [];
        $scope.socket.emit('add', crawl);
    };

    $scope.deleteCrawl = function(crawlid) {
        $scope.socket.emit('remove', {crawlid:crawlid});
    };

    $scope.removeCrawl = function(data) {
        var index = -1;
        for (var ii = 0; ii < $scope.crawls.length; ii++) {
            if ($scope.crawls[ii].crawlid == data.crawlid) {
                index = ii;
            }
        }
        if (index >= 0) {
            $scope.crawls.splice(index, 1);
        }
    };

    $scope.addCrawl = function(crawl) {
        for (var ii = 0; ii < $scope.crawls.length; ii++) {
            if ($scope.crawls[ii].crawlid == crawl.crawlid) {
                return false;
            }
        }
        $scope.crawls.push(crawl);
        return true;
    };

    $scope.startCrawl = function(crawl) {
        if (!$scope.online) {
            alert("Connection to server failed; please reload page and try again.");
            return;
        }
        if (!crawl.url) {
            $("#newCrawlUrl").addClass("has-error").find("input").focus();
        } else {
            $("#newCrawlUrl").removeClass("has-error");
            
            //sanitize crawlid
            if (!crawl.crawlid) 
                crawl.crawlid = uuid4();
            
            //sanitize depth
            var depth = parseInt(crawl.depth);
            if (!depth) 
                depth = 0;
            crawl.depth = depth;

            crawl.appid = $scope.appid;            
            crawl.messages = [];
            
            $scope.socket.emit('crawl', crawl);
        }
    };

    $scope.initCrawl();
    $scope.crawls = [];
    $scope.socket.emit('hello');
}]);

