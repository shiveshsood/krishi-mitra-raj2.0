const url = require('url');
const qs = require('querystring');
const db = require('../dbmodule');
let routes = {
	'GET': {
		'/': (req, res) => {
			console.log('Hi');
			res.writeHead(200, {'Content-type': 'text/html'});
			res.end('<h1>Hello Router</h1>');
		},
		'/about': (req, res) => {
			res.writeHead(200, {'Content-type': 'text/html'});
			res.end('<h1>This is the about page</h1>');
		},
		/*'/getgraph': (req,res) => {
			console.log('user whose graphs have been requested : ' , req.queryParams['user']);
			db.getLocation(req.queryParams['user'],db.graphHelper,function(final) {
			let location = {
					userLat: final.userLat,
					userLng: final.userLng
				};
			res.writeHead(200,{'Content-type': 'text/html'});
			fs.readFile('./getgraph.html', function(err, data) {
        if (!err) {
					res.end(data);
				}
		});
	});
},*/
		'/api/getinfo': (req, res) => {																	//route to provide weather data to node MCU which it will further message to the farmer who requested info.
			// fetch data from db and respond as JSON
			console.log( 'val : ' , req.queryParams['nature']);
      if(req.queryParams['nature']=='1' && req.queryParams['user']) {																							//nature of request = 1 if user requests local weather info
        console.log('The user'+ req.queryParams['user'] + ' has requested local weather data.');		//search phone number in database for lat and long data so we can obtain corresponding weather info from openweathermap api
				db.getLocation(req.queryParams['user'], db.getWeather, function(final) {										// db helper function to query api based on user location and calculate rain expected in next 24 hours
					res.writeHead(200, {'Content-type': 'text/html'});
					res.end(final);
				});
			}
			else if(req.queryParams['nature']=='2' && req.queryParams['user']) {											//nature of request = 2 if user requests soil info/ tips
				console.log('The user'+ req.queryParams['user'] + ' has requested soil info/tips');
				db.getLocation(req.queryParams['user'], db.getSoilInfo , function(final) {										// db helper function to query api based on user location and call function to query soil info
					res.writeHead(200, {'Content-type': 'application/json'});
					res.end(JSON.stringify(final));
				});
			}
			else
			{
				res.writeHead(400, {'Content-type': 'text/html'});
				res.end('<h3>Invalid Parameters provided.Severing Connection. 400 Bad Request.</h3><br/><h1>BYE!</h1>');
				() => req.connection.destroy();
			}
	}
},
	'POST': {
		'/api/postinfo': (req, res) => {						//route to take in sensor data from farmers and upload data to cloud
			console.log('HI');
			let body = '';
			req.on('data', data => {
				body += data;
				console.log('Size: ', body.length / (1024 * 1024));
				if(body.length > 2097152) {
					res.writeHead(413, {'Content-type': 'text/html'});
					res.end('<h3>Error: The file being uploaded exceeds the 2MB limit</h3>',
						() => req.connection.destroy());
				}
			});

			req.on('end', () => {
				let params = qs.parse(body);
				console.log(params);
				if(params['moisture'] && params['EC'] && params['user'])				//if all required variables are present, we must update the db with new sensor data
				{
					var time = Math.floor((new Date().getTime()/1000));						//unix time
					console.log('moisture: ', Number(params['moisture']));
					console.log('soil EC: ', Number(params['EC']));
					console.log ('user phone number ', params['user']);
					console.log('time of update : ', time);
					let sensorData = {
						moisture : Number(params['moisture']),
						EC : Number(params['EC'])
					};
					res.end();
					db.postSensorData(sensorData,params['user'],time);
				}
				else                   																				//bad request : invalid params.
				{
					res.writeHead(400, {'Content-type': 'text/html'});
					res.end('<h3>Invalid Parameters provided.Severing Connection. 400 Bad Request.</h3><br/><h1>BYE!</h1>');
					() => req.connection.destroy();
				}

				// Query a db to see if the user exists
				// If so, send a JSON response to the SPA
			});
		}
	},
	'NA': (req, res) => {
		res.writeHead(404);
		res.end('Content not found!');
	}
}

let router = (req, res) => {
	let baseURI = url.parse(req.url, true);
	let resolveRoute = routes[req.method][baseURI.pathname];
	if(resolveRoute != undefined) {
		req.queryParams = baseURI.query;
		resolveRoute(req, res);
	} else {
		routes['NA'](req, res);
	}

}
module.exports = {
  router
}
