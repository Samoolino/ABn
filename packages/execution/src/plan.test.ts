import {describe,expect,it} from 'vitest';import {needsRecovery} from './plan';
describe('execution recovery',()=>{it('recovers filled/unfilled legs',()=>expect(needsRecovery({correlationId:'x',maxUnhedgedMs:5000,maxRecoverySlippageBps:50,legs:[{venue:'a',symbol:'X',side:'BUY',quantity:1,status:'FILLED'},{venue:'b',symbol:'X',side:'SELL',quantity:1,status:'PARTIAL'}]})).toBe(true));});
