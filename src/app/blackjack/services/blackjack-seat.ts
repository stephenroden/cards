import { BlackjackSeat, BlackjackState } from '../blackjack.models';

export const humanSeat = (state: BlackjackState): BlackjackSeat =>
  state.seats.find((seat) => seat.type === 'human') ?? state.seats[0];

export const cpuSeats = (state: BlackjackState): BlackjackSeat[] =>
  state.seats.filter((seat) => seat.type === 'cpu');

/** A seat is in the round once it has been dealt cards for the current hand. */
export const seatIsDealtIn = (seat: BlackjackSeat): boolean => !seat.out && seat.hands.length > 0;

export const seatTotalBet = (seat: BlackjackSeat): number =>
  seat.hands.reduce((sum, hand) => sum + hand.bet, 0);
