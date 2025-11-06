// polyfills.ts
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

// Add atob/btoa for libs that expect them (web APIs)
import { decode as atob, encode as btoa } from 'base-64';
if (typeof global.atob === 'undefined') (global as any).atob = atob;
if (typeof global.btoa === 'undefined') (global as any).btoa = btoa;
