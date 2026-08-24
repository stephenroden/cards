import { describe, expect, it } from 'vitest';
import { Contract, Risk, Seat, Strain, Vulnerability } from '../bridge.models';
import { scoreDeal } from './bridge-scoring';

const contract = (level: number, strain: Strain, risk: Risk = 'none', declarer: Seat = 'south'): Contract => ({
  level,
  strain,
  declarer,
  risk
});

const score = (c: Contract, tricks: number, vul: Vulnerability = 'none'): number => scoreDeal(c, tricks, vul).score;

describe('scoreDeal', () => {
  it('pays the standard game contracts', () => {
    expect(score(contract(4, 'spades'), 10)).toBe(420);
    expect(score(contract(4, 'spades'), 10, 'ns')).toBe(620);
    expect(score(contract(3, 'notrump'), 9)).toBe(400);
    expect(score(contract(5, 'clubs'), 11)).toBe(400);
  });

  it('pays part-scores a flat fifty', () => {
    expect(score(contract(2, 'hearts'), 8)).toBe(110);
    expect(score(contract(1, 'notrump'), 7)).toBe(90);
  });

  it('adds overtricks at the trick value when undoubled', () => {
    expect(score(contract(3, 'notrump'), 10)).toBe(430);
    expect(score(contract(1, 'notrump'), 8)).toBe(120);
    expect(score(contract(2, 'diamonds'), 9)).toBe(110);
  });

  it('pays doubled overtricks per trick rather than at suit value', () => {
    // Doubled overtricks are 100 each non-vulnerable, 200 vulnerable.
    expect(score(contract(4, 'spades', 'doubled'), 11)).toBe(690);
    expect(score(contract(4, 'spades', 'doubled'), 11, 'ns')).toBe(990);
  });

  it('lifts a doubled part-score into game', () => {
    // 2S doubled is 120 trick points, which clears the 100 line and earns the game bonus.
    expect(score(contract(2, 'spades', 'doubled'), 8)).toBe(470);
    expect(score(contract(4, 'spades', 'doubled'), 10)).toBe(590);
  });

  it('pays slam bonuses on top of game', () => {
    expect(score(contract(6, 'hearts'), 12, 'ns')).toBe(1430);
    expect(score(contract(6, 'hearts'), 12)).toBe(980);
    expect(score(contract(7, 'notrump'), 13, 'ns')).toBe(2220);
  });

  it('escalates doubled undertricks and gives them to the defenders', () => {
    expect(score(contract(4, 'spades', 'doubled'), 7, 'ns')).toBe(800);
    expect(score(contract(4, 'spades', 'doubled'), 8)).toBe(300);
    expect(score(contract(4, 'spades', 'doubled'), 6)).toBe(800);
    expect(score(contract(4, 'spades', 'redoubled'), 9)).toBe(200);
  });

  it('charges undoubled undertricks at fifty, or a hundred when vulnerable', () => {
    expect(score(contract(3, 'notrump'), 8)).toBe(50);
    expect(score(contract(3, 'notrump'), 6)).toBe(150);
    expect(score(contract(3, 'notrump'), 8, 'ns')).toBe(100);
  });

  it('credits the side that actually earned the score', () => {
    const made = scoreDeal(contract(4, 'spades', 'none', 'south'), 10, 'none');
    expect(made).toEqual({ made: true, score: 420, scoredBy: 'ns' });

    const failed = scoreDeal(contract(4, 'spades', 'none', 'south'), 9, 'none');
    expect(failed).toEqual({ made: false, score: 50, scoredBy: 'ew' });

    const eastMakes = scoreDeal(contract(3, 'notrump', 'none', 'east'), 9, 'none');
    expect(eastMakes.scoredBy).toBe('ew');
  });
});
