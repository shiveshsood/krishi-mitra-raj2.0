'use strict';
const routeboy = require('./routes');
const http = require('http');
const db = require('./dbmodule');


http.createServer(routeboy.router).listen(process.env.PORT || 3000, () => {
	console.log('Server running on port 3000');
});
