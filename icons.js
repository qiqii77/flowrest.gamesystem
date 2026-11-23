/* Icons are unmodified upstream SVGs downloaded through Iconify; see assets/icons/sources.json. */
'use strict';
const availableIcons = new Set([
  'menu',
  'x',
  'search',
  'arrow-left',
  'arrow-right',
  'arrow-up',
  'arrow-down',
  'chevron-down',
  'chevron-up',
  'external-link',
  'play',
  'trophy',
  'user-round',
  'log-in',
  'log-out',
  'plus',
  'trash-2',
  'copy',
  'circle',
  'map-pin',
  'calendar-days',
  'sliders-horizontal',
  'lock-keyhole',
  'timer',
  'arrow-up-down',
  'pause',
  'rotate-ccw',
  'shuffle',
  'check',
  'info',
]);
function icon(name) {
  if (!availableIcons.has(name)) throw new Error('Unknown library icon: ' + name);
  return '<span class="app-icon icon-' + name + '" aria-hidden="true"></span>';
}
