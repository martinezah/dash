var express = require('express.io');
var app = express();
app.http().io();

// Set up sessions
app.use(express.cookieParser())
app.use(express.session({secret: 'n53FXVBYULeuV26LkZpaSM4k'}))

// Set up static routes
var path = require('path');
app.use('/js', express.static(path.join(__dirname, 'static/js')));
app.use('/css', express.static(path.join(__dirname, 'static/css')));
app.use('/media', express.static(path.join(__dirname, 'static/media')));

// Set up realtime routes


// Connect
app.listen(8080)
