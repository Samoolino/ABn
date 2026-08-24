import { describe,expect,it } from 'vitest';
import { executableVwap } from './vwap';
describe('executableVwap',()=>{it('computes depth-aware VWAP',()=>{expect(executableVwap([{price:100,amount:2},{price:102,amount:3}],4)).toEqual({filled:4,vwap:101,notional:404,unfilled:0});});it('reports insufficient liquidity',()=>{expect(executableVwap([{price:100,amount:2}],3).unfilled).toBe(1);});});
