import { Contract, Partnership, Risk, Strain, Vulnerability, isVulnerable, opposing, partnershipOf } from '../bridge.models';

const MINORS: Strain[] = ['clubs', 'diamonds'];

const riskMultiplier = (risk: Risk): number => (risk === 'redoubled' ? 4 : risk === 'doubled' ? 2 : 1);

const perTrick = (strain: Strain): number => (MINORS.includes(strain) ? 20 : 30);

/** Points for the tricks actually contracted for; notrump charges a premium for the first. */
export const contractPoints = (contract: Contract): number => {
  const base =
    contract.strain === 'notrump' ? 40 + (contract.level - 1) * 30 : perTrick(contract.strain) * contract.level;
  return base * riskMultiplier(contract.risk);
};

const overtrickValue = (contract: Contract, vulnerable: boolean): number => {
  if (contract.risk === 'doubled') {
    return vulnerable ? 200 : 100;
  }
  if (contract.risk === 'redoubled') {
    return vulnerable ? 400 : 200;
  }
  return contract.strain === 'notrump' ? 30 : perTrick(contract.strain);
};

/** Doubled penalties escalate: the fourth and later undertricks cost more than the second and third. */
const undertrickPoints = (down: number, risk: Risk, vulnerable: boolean): number => {
  if (risk === 'none') {
    return down * (vulnerable ? 100 : 50);
  }

  let total = 0;
  for (let index = 1; index <= down; index += 1) {
    if (vulnerable) {
      total += index === 1 ? 200 : 300;
    } else {
      total += index === 1 ? 100 : index <= 3 ? 200 : 300;
    }
  }
  return total * (risk === 'redoubled' ? 2 : 1);
};

const slamBonus = (level: number, vulnerable: boolean): number => {
  if (level === 7) {
    return vulnerable ? 1500 : 1000;
  }
  if (level === 6) {
    return vulnerable ? 750 : 500;
  }
  return 0;
};

export interface DealScore {
  made: boolean;
  score: number;
  scoredBy: Partnership;
}

/** Scores one deal from the declaring side's point of view, then attributes it to whoever earned it. */
export const scoreDeal = (contract: Contract, tricksWon: number, vulnerability: Vulnerability): DealScore => {
  const declaringSide = partnershipOf(contract.declarer);
  const vulnerable = isVulnerable(declaringSide, vulnerability);
  const required = contract.level + 6;

  if (tricksWon < required) {
    return {
      made: false,
      score: undertrickPoints(required - tricksWon, contract.risk, vulnerable),
      scoredBy: opposing(declaringSide)
    };
  }

  const trickScore = contractPoints(contract);
  const overtricks = (tricksWon - required) * overtrickValue(contract, vulnerable);
  // A doubled part-score can be lifted over the 100 line and pay the game bonus.
  const gameBonus = trickScore >= 100 ? (vulnerable ? 500 : 300) : 50;
  const insult = contract.risk === 'doubled' ? 50 : contract.risk === 'redoubled' ? 100 : 0;

  return {
    made: true,
    score: trickScore + overtricks + gameBonus + slamBonus(contract.level, vulnerable) + insult,
    scoredBy: declaringSide
  };
};
