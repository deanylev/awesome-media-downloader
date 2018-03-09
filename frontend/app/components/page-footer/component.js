import Component from '@ember/component';

export default Component.extend({
  currentYear: Ember.computed(function() {
    return new Date().getFullYear();
  })
});
