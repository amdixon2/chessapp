const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fen2matrix } = require('../chessapp.js');

describe('fen2matrix', () => {
  test('returns 8 rows of 8 files for an empty board', () => {
    const matrix = fen2matrix('8/8/8/8/8/8/8/8 w - - 0 1');
    assert.equal(matrix.length, 8);
    matrix.forEach(row => assert.equal(row.length, 8));
    matrix.forEach(row => row.forEach(square => assert.equal(square, '')));
  });

  test('maps each FEN rank to the correct row', () => {
    const matrix = fen2matrix('8/8/8/8/8/8/1P6/R6K w - - 0 1');
    // Rank 8 -> row 0 empty
    assert.ok(matrix[0].every(square => square === ''));
    // Rank 2 -> row 6 contains pawn on b-file
    assert.equal(matrix[6][0], ''); // a2
    assert.equal(matrix[6][1], 'P'); // b2
    // Rank 1 -> row 7 contains rook on a1 and king on h1
    assert.equal(matrix[7][0], 'R');
    assert.equal(matrix[7][7], 'K');
  });

  test('handles mixed piece and empty counts within a rank', () => {
    const matrix = fen2matrix('r1bqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    // Row 0 (rank 8) -> pieces per starting position
    assert.deepEqual(matrix[0], ['r', '', 'b', 'q', 'k', 'b', 'n', 'r']);
    // Row 1 (rank 7) -> all pawns
    assert.ok(matrix[1].every(square => square === 'p'));
    // Row 7 (rank 1) -> white pieces
    assert.deepEqual(matrix[7], ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']);
  });
});
