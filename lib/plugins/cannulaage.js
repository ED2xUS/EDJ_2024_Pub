'use strict';

var _ = require('lodash');
var moment = require('moment');
var levels = require('../levels');

var cage = {
  name: 'cage'
  , label: 'Cannula Age'
  , pluginType: 'pill-minor'
};

function init() {
  return cage;
}

module.exports = init;

cage.getPrefs = function getPrefs (sbx) {
  // CAGE_INFO = 44 CAGE_WARN=48 CAGE_URGENT=70
  var info = Number(sbx.extendedSettings.info);
  var warn = Number(sbx.extendedSettings.warn);
  var urgent = Number(sbx.extendedSettings.urgent);

  return {
    info: !isNaN(info) ? info : 44,
    warn: !isNaN(warn) ? warn : 48,
    urgent: !isNaN(urgent) ? urgent : 72,
    display: sbx.extendedSettings.display ? sbx.extendedSettings.display : 'hours',
    enableAlerts: sbx.extendedSettings.enableAlerts
  };
};

cage.checkNotifications = function checkNotifications (sbx) {
  var cannulaInfo = cage.findLatestTimeChange(sbx);

  if (cannulaInfo.notification) {
    sbx.notifications.requestNotify(cannulaInfo.notification);
  }
};

cage.findLatestTimeChange = function findLatestTimeChange (sbx) {

  var prefs = cage.getPrefs(sbx);

  var cannulaInfo = {
    message:''
    , found: false
    , age: 0
    , treatmentDate: null
    , checkForAlert: false
  };

  var prevDate = 0;

  _.each(sbx.data.sitechangeTreatments, function eachTreatment (treatment) {
    var treatmentDate = treatment.mills;
    if (treatmentDate > prevDate && treatmentDate <= sbx.time) {

      prevDate = treatmentDate;
      cannulaInfo.treatmentDate = treatmentDate;

      //allow for 30 minute period after a full hour during which we'll alert the user
      var a = moment(sbx.time);
      var b = moment(cannulaInfo.treatmentDate);
      var days = a.diff(b,'days');
      var hours = a.diff(b,'hours') - days * 24;
      var age = a.diff(b,'hours');

      cannulaInfo.minFractions = a.diff(b,'minutes') - age * 60;

      if (!cannulaInfo.found) {
        cannulaInfo.found = true;
        cannulaInfo.age = age;
        cannulaInfo.days = days;
        cannulaInfo.hours = hours;
      } else  if (age >= 0 && age < cannulaInfo.age) {
        cannulaInfo.age = age;
        cannulaInfo.days = days;
        cannulaInfo.hours = hours;
        cannulaInfo.notes = treatment.notes;
      }
    }
  });

  cannulaInfo.level = levels.NONE;

  var sound = 'incoming';
  var message;
  var sendNotification = false;

  if (cannulaInfo.age >= prefs.urgent) {
    sendNotification = cannulaInfo.age === prefs.urgent;
    message = 'Cannula change overdue!';
    sound = 'persistent';
    cannulaInfo.level = levels.URGENT;
  } else if (cannulaInfo.age >= prefs.warn) {
    sendNotification = cannulaInfo.age === prefs.warn;
    message = 'Time to change cannula';
    cannulaInfo.level = levels.WARN;
  } else  if (cannulaInfo.age > prefs.info) {
    sendNotification = cannulaInfo.age === prefs.info;
    message = 'Change cannula soon';
    cannulaInfo.level = levels.INFO;
  }

  if (sendNotification && cannulaInfo.minFractions <= 30) {
    cannulaInfo.notification = {
      title: 'Cannula age ' + cannulaInfo.age + ' hours'
      , message: message
      , pushoverSound: sound
      , level: cannulaInfo.level
      , plugin: cage
      , group: 'CAGE'
      , debug: {
        age: cannulaInfo.age
      }
    };
  }

  return cannulaInfo;
};

cage.updateVisualisation = function updateVisualisation (sbx) {

  var cannulaInfo = cage.findLatestTimeChange(sbx);
  var prefs = cage.getPrefs(sbx);

  var info = [{ label: 'Inserted', value: new Date(cannulaInfo.treatmentDate).toLocaleString() }];

  if (!_.isEmpty(cannulaInfo.notes)) {
    info.push({label: 'Notes:', value: cannulaInfo.notes});
  }

  var shownAge = '';
  if (prefs.display === 'days' && cannulaInfo.found) {
    if (cannulaInfo.age >= 24) {
      shownAge += cannulaInfo.days + 'd';
    }
    shownAge += cannulaInfo.hours + 'h';
  } else {
    shownAge = cannulaInfo.found ? cannulaInfo.age + 'h' : 'n/a ';
  }

  var statusClass = null;
  if (cannulaInfo.level === levels.URGENT) {
    statusClass = 'urgent';
  } else if (cannulaInfo.level === levels.WARN) {
    statusClass = 'warn';
  }

  sbx.pluginBase.updatePillText(cage, {
    value: shownAge
    , label: 'CAGE'
    , info: info
    , pillClass: statusClass
  });
};