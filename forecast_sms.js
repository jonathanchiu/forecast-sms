var express         = require('express');
var body_parser     = require('body-parser');
var request         = require('request');
var twilio          = require('twilio');
var async           = require('async');
var router          = express.Router();
// Should probably store these as environment variables...
var twilio_auth     = 'TWILIO_AUTH_HERE';
var forecastio_auth = 'FORECASTIO_AUTH_HERE';
var geonames_user   = 'GEONAMES_USERNAME_HERE';

router.use(body_parser.urlencoded({
  extended: true
}));
router.use(body_parser.json());

router.post("/", function(req, res) {
  var options = { url: 'TWILIO_MAKES_POST_REQUEST_AT_THIS_URL' };

  // Verify that POST request came from Twilio and not some mean person
  if (twilio.validateExpressRequest(req, twilio_auth, options)) {
    console.log("Request from Twilio verified.");

    // Remove all whitespace occurrences
    var zip_code = req.body.Body.replace(/\s/g, '');

    if (zip_code.length === 5) {
      /**
       * Make API calls synchronously because we need data from
       * previous calls for subsequent calls
       */
      async.waterfall([
        /**
         * Call Geonames API which will pass an incoming SMS zip code
         * as a parameter. Returns a JSON object from which we get the
         * zip code's corresponding latitude and longitude.
         */
        function (callback) {
          var url = 'http://api.geonames.org/postalCodeSearchJSON?postalcode=' + zip_code + '&maxRows=1&username=' + geonames_user;

          request(url, function (error, res, body) {
            if (!error) {
              var info = JSON.parse(body)["postalCodes"][0];
              var lat  = info.lat.toString();
              var lng  = info.lng.toString();

              callback(null, lat, lng);
            } else {
              console.log("zipCodeToCoords: ERROR");
              console.log(error);
            }
          });
        },
        /**
         * Given latitude and longitude from previous function, make
         * a call to Forecast.IO API to get the current weather for the
         * corresponding coordinates. Return string containing temperature and
         * current weather status
         */
        function (lat, lng, callback) {
          var coords = lat + ',' + lng;
          var url = 'https://api.forecast.io/forecast/' + forecastio_auth + '/' + coords;

          request(url, function (error, res, body) {
            if (!error) {
              var temperature = JSON.parse(body)["currently"].temperature;
              var status = JSON.parse(body)["currently"].summary;
              var sms = "It is currently " + temperature + " degrees fahrenheit. " + status;

              callback(null, sms);
            } else {
              console.log("coordsToWeatherSMS: ERROR");
              console.log(error);
            }
          });
        }
      ],
      /**
       * Finally, using Twilio API, send a response SMS with the generated
       * weather information from above
       */
      function (err, result) {
        var twiml = new twilio.TwimlResponse();

        twiml.message(result);
        res.type('text/xml');
        res.send(twiml.toString());

        console.log("sendSMS: CALLED");
        console.log(result);
      });
    } else {
      res.send("Invalid input");
    }
  }
  // Someone is being mean...
  else {
    var twiml = new twilio.TwimlResponse();
    twiml.message("You're being malicious. Go away.");

    res.type('text/xml');
    res.send(twiml.toString());
  }
});

module.exports.router = router;