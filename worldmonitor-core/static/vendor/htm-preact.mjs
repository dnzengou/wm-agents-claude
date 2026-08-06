// Local binding of htm to Preact's `h`, replacing the esm.sh `htm/preact` build.
// Provides the default export (`html`) the app imports, plus named re-exports.
import { h } from 'preact';
import htm from 'htm';
const html = htm.bind(h);
export default html;
export { html, h };
export { render, Component } from 'preact';
