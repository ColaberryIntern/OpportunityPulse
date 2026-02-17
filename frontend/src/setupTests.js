// Jest setup file for the Opportunity Pulse frontend.
// react-scripts automatically loads src/setupTests.js before each test suite.

// Polyfill TextEncoder/TextDecoder for jsdom environment (required by react-router v7)
const { TextEncoder, TextDecoder } = require('util');

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}
