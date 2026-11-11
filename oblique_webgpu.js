import * as T from 'three';
import {main,showFailure} from './oblique_three.js';
main({createRenderer:()=>new T.WebGPURenderer({antialias:!/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)}),createGroup:()=>new T.ClippingGroup()}).catch(showFailure);
