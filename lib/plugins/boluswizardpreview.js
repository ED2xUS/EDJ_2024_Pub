'use strict';

var TEN_MINS = 10 * 60 * 1000;

function init() {

  function bwp() {
    return bwp;
  }

  bwp.label = 'Bolus Wizard Preview';
  bwp.pluginType = 'pill-minor';

  function hasRequiredInfo (sbx) {

    var warnings = [];
    if (!sbx.data.profile || !sbx.data.profile.hasData()) {
      warnings.push('Missing need a treatment profile');
    }

    if (!sbx.data.profile.getSensitivity(sbx.time) || !sbx.data.profile.getHighBGTarget(sbx.time) || !sbx.data.profile.getLowBGTarget(sbx.time)) {
      warnings.push('Missing sens, target_high, or target_low treatment profile fields');
    }

    if (!sbx.properties.iob) {
      warnings.push('Missing IOB property');
    }

    if (sbx.lastSGV() < 40 || sbx.time - sbx.lastSGVMills() > TEN_MINS) {
      warnings.push('Data isn\'t current');
    }

    if (warnings.length > 0) {
      console.warn('BWP plugin doesn\'t have required info: ' + warnings.join('; '));
      return false;
    }

    return true;

  }

  bwp.setProperties = function setProperties(sbx) {
    sbx.offerProperty('bwp', function setBWP ( ) {
      if (hasRequiredInfo(sbx)) {
        return bwp.calc(sbx);
      }
    });
  };


  bwp.checkNotifications = function checkNotifications (sbx) {

    var results = sbx.properties.bwp;
    if (results === undefined) { return; }

    if (results.lastSGV < sbx.data.profile.getHighBGTarget(sbx.time)) { return; }

    var settings = prepareSettings(sbx);

    if (results.lastSGV > sbx.thresholds.bg_target_top && results.bolusEstimate < settings.snoozeBWP) {
      sbx.notifications.requestSnooze({
        level: sbx.notifications.levels.URGENT
        , lengthMills: settings.snoozeLength
        , debug: results
      });
    } else if (results.bolusEstimate > settings.warnBWP) {
      var level = results.bolusEstimate > settings.urgentBWP ? sbx.notifications.levels.URGENT : sbx.notifications.levels.WARN;
      var levelLabel = sbx.notifications.levels.toString(level);
      var sound = level === sbx.notifications.levels.URGENT ? 'updown' : 'bike';

      sbx.notifications.requestNotify({
        level: level
        , title: levelLabel + ', Check BG, time to bolus?'
        , message: sbx.buildDefaultMessage()
        , eventName: 'bwp'
        , pushoverSound: sound
        , plugin: bwp
        , debug: results
      });
    }
  };


  bwp.updateVisualisation = function updateVisualisation (sbx) {

    var results = sbx.properties.bwp;
    if (results === undefined) { return; }

    // display text
    var info = [
      {label: 'Insulin on Board', value: results.displayIOB + 'U'}
      ,
      {label: 'Expected effect', value: '-' + results.effectDisplay + ' ' + sbx.units}
      ,
      {label: 'Expected outcome', value: results.outcomeDisplay + ' ' + sbx.units}
    ];

    if (results.tempBasalAdjustment) {
      if (results.tempBasalAdjustment.thirtymin > 0) {
        info.push({label: '30m temp basal', value: results.tempBasalAdjustment.thirtymin + '%'});
      } else {
        info.push({label: '30m temp basal', value: 'too large adjustment needed, give carbs?'});
      }
      if (results.tempBasalAdjustment.onehour > 0) {
        info.push({label: '1h temp basal', value: results.tempBasalAdjustment.onehour + '%'});
      } else {
        info.push({label: '1h temp basal', value: 'too large adjustment needed, give carbs?'});
      }
    }

    sbx.pluginBase.updatePillText(bwp, {
      value: results.bolusEstimateDisplay + 'U'
      , label: 'BWP'
      , info: info
    });
  };

  bwp.calc = function calc (sbx) {

    var results = {
      effect: 0
      , outcome: 0
      , bolusEstimate: 0.0
    };

    var sgv = sbx.lastScaledSGV();

    results.lastSGV = sgv;

    if (!hasRequiredInfo(sbx)) {
      return results;
    }

    var profile = sbx.data.profile;
    var iob = results.iob = sbx.properties.iob.iob;

    results.effect = iob * profile.getSensitivity(sbx.time);
    results.outcome = sgv - results.effect;
    var delta = 0;
    
    var target_high = profile.getHighBGTarget(sbx.time);
    var sens = profile.getSensitivity(sbx.time);

    if (results.outcome > target_high) {
      delta = results.outcome - target_high;
      results.bolusEstimate = delta / sens;
    }

    var target_low = profile.getLowBGTarget(sbx.time);

    if (results.outcome < target_low) {
      delta = Math.abs(results.outcome - target_low);
      results.bolusEstimate = delta / sens * -1;
    }
    
    if (results.bolusEstimate !== 0 && sbx.data.profile.getBasal()) {
      // Basal profile exists, calculate % change
      var basal = sbx.data.profile.getBasal(sbx.time);
      
      var thirtyMinAdjustment = Math.round((basal/2 + results.bolusEstimate) / (basal / 2) * 100);
      var oneHourAdjustment = Math.round((basal + results.bolusEstimate) / basal * 100);
      
      results.tempBasalAdjustment = {
        'thirtymin': thirtyMinAdjustment
        ,'onehour': oneHourAdjustment};
    }

    results.bolusEstimateDisplay = sbx.roundInsulinForDisplayFormat(results.bolusEstimate);
    results.outcomeDisplay = sbx.roundBGToDisplayFormat(results.outcome);
    results.displayIOB = sbx.roundInsulinForDisplayFormat(results.iob);
    results.effectDisplay = sbx.roundBGToDisplayFormat(results.effect);
    results.displayLine = 'BWP: ' + results.bolusEstimateDisplay + 'U';

    return results;
  };

  function prepareSettings (sbx) {
    return {
      snoozeBWP: Number(sbx.extendedSettings.snooze) || 0.10
    , warnBWP: Number(sbx.extendedSettings.warn) || 0.50
    , urgentBWP: Number(sbx.extendedSettings.urgent) || 1.00
    , snoozeLength: (sbx.extendedSettings.snoozeMins && Number(sbx.extendedSettings.snoozeMins) * 60 * 1000) || TEN_MINS
    };
  }

  return bwp();

}

module.exports = init;