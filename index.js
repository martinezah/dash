var express = require('express.io');
var app = express();
app.http().io();

// Set up sessions
app.use(express.cookieParser());
app.use(express.session({secret: 'n53FXVBYULeuV26LkZpaSM4k'}));

// Set up static routes
var path = require('path');
app.use('/', express.static(path.join(__dirname, 'static')));

// Set up realtime routes
app.io.route('hello', function(req) {
    var sessid = Math.random().toString(36).substr(2,14);
    req.session.name = sessid;
    req.session.crawls = {};
    req.session.save(function() {
        req.io.emit('hello-ok');
    });
});

app.io.route('add', function(req) {
    var crawlid = req.data.crawlid;
    req.session.crawls[crawlid] = 1;
    req.session.save(function() {
        req.io.emit('add-ok', {crawls:req.session.crawls});
    });
});

app.io.route('remove', function(req) {
    var crawlid = req.data.crawlid;
    delete req.session.crawls[crawlid];
    req.session.save(function() {
        req.io.emit('add-ok', {crawls:req.session.crawls});
    });
});

// Connect
app.listen(8080);
