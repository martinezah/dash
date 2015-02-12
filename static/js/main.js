var app = angular.module('app', []);

app.controller('crawler', ['$scope', '$timeout', function($scope, $timeout) { 
    window.$scope = $scope;

    $scope.socket = io.connect();
    $scope.online = false;

    $scope.socket.on('hello-ok', function(data) {
        $timeout(function() {
            $scope.online = true;
        }, 0);
    });

    $scope.socket.on('add-ok', function(data) {
    });

    $scope.socket.on('remove-ok', function(data) {
    });

    $scope.socket.on('crawl-notimpl', function(data) {
        $timeout(function() {
            $scope.initCrawl();
        }, 0);
    });

    $scope.initCrawl = function() {
        $scope.newCrawl = {
            url: 'http://',
            depth: 1,
            appid: 'ist-dashboard',
            crawlid: uuid4(),
        };
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
            
            $scope.socket.emit("crawl", crawl);
        }
    };

    $scope.initCrawl();
    $scope.socket.emit('hello');
}]);

