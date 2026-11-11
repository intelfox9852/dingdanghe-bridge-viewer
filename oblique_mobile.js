import * as T from 'three';
import {main,showFailure} from './oblique_three.js';
main({classic:true,createRenderer:()=>new T.WebGLRenderer({antialias:false,alpha:false,precision:'mediump'}),createGroup:()=>new T.Group()}).catch(showFailure);
