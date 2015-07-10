'use strict';

var _ = require('lodash');

function init() {

  var TIME_10_MINS_MS = 10 * 60 * 1000;

  function treatmentnotify() {
    return treatmentnotify;
  }

  treatmentnotify.label = 'Treatment Notifications';
  treatmentnotify.pluginType = 'notification';

  treatmentnotify.checkNotifications = function checkNotifications (sbx) {

    var now = Date.now();

    var lastMBG = sbx.lastEntry(sbx.data.mbgs);
    var lastTreatment = sbx.lastEntry(sbx.data.treatments);

    //TODO: figure out why date is x here #CleanUpDataModel
    var lastMBGTime = lastMBG ? lastMBG.mills : 0;
    var mbgAgo = (lastMBGTime && lastMBGTime <= now) ? now - lastMBGTime : -1;
    var mbgCurrent = mbgAgo !== -1 && mbgAgo < TIME_10_MINS_MS;

    var lastTreatmentTime = lastTreatment ? lastTreatment.mills : 0;
    var treatmentAgo = (lastTreatmentTime && lastTreatmentTime <= now) ? now - lastTreatmentTime : -1;
    var treatmentCurrent = treatmentAgo !== -1 && treatmentAgo < TIME_10_MINS_MS;

    if (mbgCurrent || treatmentCurrent) {

      var mbgMessage = mbgCurrent ? 'Meter BG ' + sbx.scaleBg(lastMBG.y) + ' ' + sbx.unitsLabel : '';
      var treatmentMessage = treatmentCurrent ? 'Treatment: ' + lastTreatment.eventType : '';
      autoSnoozeAlarms(mbgMessage, treatmentMessage, sbx);
      //and add some info notifications
      //the notification providers (push, websockets, etc) are responsible to not sending the same notifications repeatedly
      if (mbgCurrent) { requestMBGNotify(lastMBG, sbx); }
      if (treatmentCurrent) { requestTreatmentNotify(lastTreatment, sbx); }
    }
  };

  function autoSnoozeAlarms(mbgMessage, treatmentMessage, sbx) {
    var snoozeLength = (sbx.extendedSettings.snoozeMins && Number(sbx.extendedSettings.snoozeMins) * 60 * 1000) || TIME_10_MINS_MS;
    sbx.notifications.requestSnooze({
      level: sbx.notifications.levels.URGENT
      , title: 'Snoozing alarms since there was a recent treatment'
      , message: _.trim([mbgMessage, treatmentMessage].join('\n'))
      , lengthMills: snoozeLength
    });
  }

  function requestMBGNotify (lastMBG, sbx) {
    console.info('requestMBGNotify for', lastMBG);
    sbx.notifications.requestNotify({
      level: sbx.notifications.levels.INFO
      , title: 'Calibration' //assume all MGBs are calibrations for now
      //TODO: figure out why mbg is y here #CleanUpDataModel
      , message: 'Meter BG: ' + sbx.scaleBg(lastMBG.y) + ' ' + sbx.unitsLabel
      , plugin: treatmentnotify
      , pushoverSound: 'magic'
    });
  }

  function requestTreatmentNotify (lastTreatment, sbx) {
    var message = (lastTreatment.glucose ? 'BG: ' + lastTreatment.glucose + ' (' + lastTreatment.glucoseType + ')' : '') +
      (lastTreatment.carbs ? '\nCarbs: ' + lastTreatment.carbs + 'g' : '') +

      //TODO: find a better way to connect split treatments
      //(preBolusCarbs ? '\nCarbs: ' + preBolusCarbs + ' (in ' + treatment.preBolus + ' minutes)' : '')+

      (lastTreatment.insulin ? '\nInsulin: ' + sbx.roundInsulinForDisplayFormat(lastTreatment.insulin) + 'U' : '')+
      (lastTreatment.enteredBy ? '\nEntered By: ' + lastTreatment.enteredBy : '') +

      //TODO: find a better way to store timeAdjustment
      //(timeAdjustment ? '\nEvent Time: ' + timeAdjustment : '') +

      (lastTreatment.notes ? '\nNotes: ' + lastTreatment.notes : '');


    sbx.notifications.requestNotify({
      level: sbx.notifications.levels.INFO
      , title: lastTreatment.eventType
      , message: message
      , plugin: treatmentnotify
    });

  }

  return treatmentnotify();

}

module.exports = init;