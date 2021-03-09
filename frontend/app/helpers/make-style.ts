import { helper } from '@ember/component/helper';
import { htmlSafe } from '@ember/template';

export function makeStyle([property, value]: string[]) {
  return htmlSafe(`${property}:${value};`);
}

export default helper(makeStyle);
