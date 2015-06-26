'use strict';

var _ = require('lodash');
var crypto = require('crypto');
var units = require('./units')();
var NodeCache = require( "node-cache" );

function init(env, ctx) {

  var pushover = require('./pushover')(env);

  var PUSHOVER_EMERGENCY = 2;
  var PUSHOVER_NORMAL = 0;

  // declare local constants for time differences
  var TIME_2_MINS_S = 120
    , TIME_15_MINS_S = 15 * 60
    , TIME_15_MINS_MS = TIME_15_MINS_S * 1000
    , TIME_30_MINS_MS = 30 * 60 * 1000
    ;

  function pushnotify() {
    return pushnotify;
  }

  var receipts = new NodeCache({ stdTTL: TIME_15_MINS_MS, checkperiod: 120 });
  var recentlySent = new NodeCache({ stdTTL: TIME_15_MINS_MS, checkperiod: 20 });

  pushnotify.emitNotification = function emitNotification (notify) {
    if (!pushover) return;
    if (notify.clear) return;

    var key = null;
    if (notify.level >= ctx.notifications.levels.WARN) {
      //for WARN and higher use the plugin name and notification level so that louder alarms aren't triggered too often
      key = notify.plugin.name + '_' + notify.level;
    } else {
      //INFO and lower notifications should be sent as long as they are different
      key = notifyToHash(notify);
    }

    if (recentlySent.get(key)) {
      console.info('notify: ' + key + ' has ALREADY been sent');
      return;
    }

    var msg = {
      expire: TIME_15_MINS_S
      , title: notify.title
      , message: notify.message
      , sound: notify.pushoverSound || 'gamelan'
      , timestamp: new Date()
      //USE PUSHOVER_EMERGENCY for WARN and URGENT so we get the acks
      , priority: notify.level > ctx.notifications.levels.WARN ? PUSHOVER_EMERGENCY : PUSHOVER_NORMAL
    };

    if (notify.level >= ctx.notifications.levels.WARN) {
      //ADJUST RETRY TIME based on WARN or URGENT
      msg.retry = notify.level == ctx.notifications.levels.URGENT ? TIME_2_MINS_S : TIME_15_MINS_S;
      if (env.baseUrl) {
        msg.callback = env.baseUrl + '/api/v1/notifications/pushovercallback';
      }
    }

    // if we want to have a callback snooze url this is the way, but emergency ack work better
    //      var now = Date.now();
    //      var sig = ctx.notifications.sign(1, TIME_30_MINS_MS, Date.now());
    //      if (sig) {
    //        msg.url_title = 'Snooze for 30 minutes';
    //        msg.url = env.baseUrl + '/api/v1/notifications/snooze?level=1&lengthMills=' + TIME_30_MINS_MS + '&t=' + now + '&sig=' + sig;
    //      }

    //add the key to the cache before sending, but with a short TTL
    recentlySent.set(key, notify, 30);
    pushover.send(msg, function(err, result) {
      if (err) {
        console.error('unable to send pushover notification', err);
      } else {
        //result comes back as a string here, so fix it
        result = JSON.parse(result);
        console.info('sent pushover notification: ', msg, 'result: ', result);
        //after successfully sent, increase the TTL
        recentlySent.ttl(key, TIME_15_MINS_S);

        if (result.receipt) {
          //if this was an emergency alarm, also hold on to the receipt/notify mapping, for later acking
          receipts.set(result.receipt, notify);
        }
      }
    });

  };

  pushnotify.ack = function ack (response) {
    if (!response.receipt) return false;

    var notify = receipts.get(response.receipt);
    console.info('push ack, response: ', response, ', notify: ', notify);
    if (notify) {
      ctx.notifications.ack(notify.level, TIME_30_MINS_MS, true)
    }
    return !!notify;
  };

  function notifyToHash(notify) {
    var hash = crypto.createHash('sha1');
    var info = JSON.stringify(_.pick(notify, ['title', 'message']));
    hash.update(info);
    return hash.digest('hex');
  }

  return pushnotify();
}


module.exports = init;