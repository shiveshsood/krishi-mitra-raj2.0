const admin = require('firebase-admin');
const serviceAccount = require("./serviceAccountKey.json");
var request = require('request');
var twilio = require('../node_modules/twilio');
var accountSid = 'AC1f539ebde5f52b50ecaa9d025b5a245e'; // Your Account SID from www.twilio.com/console
var authToken = 'c97307dc2a27734271030bbae226f4c7';   // Your Auth Token from www.twilio.com/console

var twilio = require('twilio');
var client = new twilio(accountSid, authToken);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://farmit-88d15.firebaseio.com/"
});
let db = admin.database();
let rootRef = db.ref("/");
let usersRef = rootRef.child('users');
console.log('The DB MODULE SAYS HI!');
let getLocation = (phno,callback,callback2) => {
  let userLat,userLng;
  usersRef.child(phno).child('lat').once("value", function(data) {            //callback once latitude extracted from db
  console.log(data.val());
  userLat = data.val();
  });
  usersRef.child(phno).child('lng').once("value", function(data) {            //callback once longitude extracted from db
  console.log(data.val());
  userLng = data.val();
  callback(userLat,userLng,callback2,phno);
});
}
let getSoilInfo = (userLat,userLng,callback,phno) => {
  let link = 'https://rest.soilgrids.org/query?lon='+ userLng + '&lat=' + userLat + '&attributes=ORCDRC,CEC,PHIHOX';
  let finalSoil = {
    pH : 0,
    org : 0,
    CEC : 0,
    subsoilpH : 0,
    interpret : '',
    EC : 0,
    moisture : 0
  };
  usersRef.child(phno).child('timestamp').orderByValue().once("value", function(data) {           //get EC and moisture data
    let x=data.val()[Object.keys(data.val())[Object.keys(data.val()).length - 1]];
    finalSoil.EC=x.EC;
    finalSoil.moisture=x.moisture;
  });
  request(link,function(error,response,body) {
    if(!error && response.statusCode == 200) {
      let soilData = JSON.parse(body);
      console.log(soilData);
      finalSoil.pH = soilData['properties']['PHIHOX']['M']['sl1'] / 10;
      finalSoil.org = soilData['properties']['ORCDRC']['M']['sl1'] /10;
      finalSoil.CEC = soilData['properties']['CECSOL']['M']['sl1'];
      finalSoil.subsoilpH = (soilData['properties']['PHIHOX']['M']['sl4'] + soilData['properties']['PHIHOX']['M']['sl4'])/ 20;
      if(finalSoil.pH < 5.5)
        finalSoil.interpret += 'Your soil pH('+finalSoil.pH+') is too low! Please compost or apply lime or wooden ashes.Reduce Nitrogen fertilizer application';
      else if(finalSoil.pH > 7.5)
        finalSoil.interpret += 'Your soil pH('+finalSoil.pH+') is too high! Please compost or apply elemental sulfur.';
      if(finalSoil.CEC < 10)
        finalSoil.interpret +='Your soil CEC('+finalSoil.CEC+') is too low! You should water your soil quickly and frequently. Apply little fertilizer in one application.Lime your soil often.Compost, worm castings and biochar are great ways to add organic matter and increase your CEC.';
      else if(finalSoil.CEC < 20 && finalSoil.CEC > 10)
        finalSoil.interpret +='Your soil CEC('+finalSoil.CEC+') is slightly low! You should water your soil quickly and frequently. Apply little fertilizer in one application.Compost, worm castings and biochar are great ways to add organic matter and increase your CEC.';
      if(finalSoil.EC < 30)
        finalSoil.interpret +='Your soil EC('+finalSoil.EC+') is low! Please apply more fertilizer.';
      if(finalSoil.moisture < 40)
        finalSoil.interpret +='Your soil moisture('+finalSoil.moisture+') is low! Please apply more fertilizer.';
        client.messages.create({
            body: finalSoil.interpret,
            to: '+919743451835',  // Text this number
            from: '+14698449174' // From a valid Twilio number
        })
        .then((message) => console.log(message.sid));
      console.log(finalSoil);
      finalSoil.interpret +=':';
      return callback(finalSoil);

    }
    else {
      console.log('Error while accessing soilGrids! : ' , error);
    }
  });
}
let getWeather = (userLat,userLng,callback) => {

  let link = 'http://api.openweathermap.org/data/2.5/forecast?lat='+ userLat + '&lon='+userLng+'&appid=67c445f952c81d4fcbf70a0b4db377e3';  //construct the link to query weather api with
  request(link, function (error, response, body) {
        if (!error && response.statusCode == 200) {
          let weatherData = JSON.parse(body);
          let finalWeather = {              //object to hold final parsed weather info relevant to farmer.
            dayRain: 0,
            cloudCover : 0,
            main:'',
            interpret: '',
            desc: ''
          };
          for(var i=0;i<8;i++)     // api responds with rain forecast of every 3 hours , so we add 8 of the next rain forecasts to obtain rain to occur in a day.
          {
            if(weatherData.list[i].rain && weatherData.list[i].rain['3h'])
              finalWeather.dayRain+=weatherData.list[i].rain['3h'];
            else {
              finalWeather.dayRain+=0;
            }
          }
          finalWeather.cloudCover=weatherData.list[0].clouds['all'];          //cloud cover for next 3 hours , percentage
          finalWeather.main=weatherData.list[0].weather[0]['main'];           //general weather type : rain/snow/clear etc.
          finalWeather.desc=weatherData.list[0].weather[0]['description'];    // description of weather in english.
          finalWeather.interpret += "Weather forecast is " + finalWeather.desc + ". It will rain " + finalWeather.dayRain.toPrecision(3) + "mm in the next 24 hours. It will be " + finalWeather.cloudCover + "% cloudy for the next 3 hours." ;
          console.log(finalWeather);
          console.log('Total rain to occur at users lat and long in 24 hours : ' + finalWeather.dayRain);
          client.messages.create({
              body: finalWeather.interpret,
              to: '+919743451835',  // Text this number
              from: '+14698449174' // From a valid Twilio number
          })
          .then((message) => console.log(message.sid));
          finalWeather.interpret+=":";
          return callback(finalWeather.interpret);      //return the parsed response from the weather api to be sent to arduino client
        }
        else {
          console.log('Error!  status Code : ' + response.statusCode);
        }
    });
}
let postSensorData = (sensorData,user,time) => {
        usersRef.child(user).child('timestamp').child(time).update(
          {
            moisture: sensorData.moisture,
            EC: sensorData.EC
          }, function(error)
          {
              if(error)
              console.log('Error in saving data : ' , error);
          }
      );
}
let graphHelper = (userLat,userLng,callback,phno) => {
  let x;
  usersRef.child(phno).child('timestamp').orderByValue().once("value", function(data) {           //get EC and moisture data
  x=data.val();
  x.userLat = userLat;
  x.userLng = userLng;
  return x;
  });


}
module.exports =  {
  rootRef,
  getWeather,
  postSensorData,
  getLocation,
  getSoilInfo,
  graphHelper
}
