var express         = require('express');
var body_parser     = require('body-parser');
var request         = require('request');
var twilio          = require('twilio');
var async           = require('async');
var router          = express.Router();
// Should probably store these as environment variables...
var twilio_auth     = 'TWILIO_AUTH_HERE';
var forecastio_auth = 'FORECASTIO_AUTH_HERE';

router.use(body_parser.urlencoded({
  extended: true
}));
router.use(body_parser.json());

router.post("/", function(req, res) {
  var options = { url: 'TWILIO_MAKES_POST_REQUEST_AT_THIS_URL' };

  // Verify that POST request came from Twilio and not some mean person
  if (twilio.validateExpressRequest(req, twilio_auth, options)) {
    console.log("Request from Twilio verified.");

    var db = req.db;
    var collection = db.get('locations');

    // Remove all whitespace occurrences and convert to integer
    var zip_code = parseInt(req.body.Body.replace(/\s/g, ''), 10);

    /**
     * Make API calls synchronously because we need data from
     * previous calls for subsequent calls
     */
    async.waterfall([
      /**
       * Query MongoDB database for the corresponding zip code
       */
      function (callback) {

        var options = { "limit": 1 };

        collection.find( { 'zip_code': zip_code }, options, function(err, records) {

          // Record found, valid zip code given
          if (records.length > 0) {
            var result    = records[0];
            var latitude  = result.latitude.toString();
            var longitude = result.longitude.toString();
            var state     = result.state_long;
            var city      = result.city;

            callback(null, latitude, longitude, state, city);
          }
          // Record not found, invalid zip code given
          else {
            var twiml = new twilio.TwimlResponse();
            twiml.message("You gave me an invalid zip code!");

            res.type('text/xml');
            res.send(twiml.toString());
          }
        });
      },
      /**
       * Given latitude and longitude from previous function, make
       * a call to Forecast.IO API to get the current weather for the
       * corresponding coordinates. Return string containing temperature and
       * current weather status
       */
      function (latitude, longitude, state, city, callback) {
        var coords     = latitude + ',' + longitude;
        var city_state = city + ', ' + state;
        var url        = 'https://api.forecast.io/forecast/' + forecastio_auth + '/' + coords;

        request(url, function (error, res, body) {
          if (!error) {
            var temperature = JSON.parse(body)["currently"].temperature;
            var status = JSON.parse(body)["currently"].summary;
            var sms = "Currently " + temperature + " degrees fahrenheit in " + city_state + ". " + status + ".";

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