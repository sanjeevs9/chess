/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from 'react';
import MoveSound from '../../public/move.wav';
import { Button } from '../components/Button';
import { ChessBoard, isPromoting } from '../components/ChessBoard';
import { useSocket } from '../hooks/useSocket';
import { Chess, Move, Square } from 'chess.js';
import { useNavigate, useParams } from 'react-router-dom';
import MovesTable from '../components/MovesTable';
import { useUser } from '@repo/store/useUser';
import { UserAvatar } from '../components/UserAvatar';

// TODO: Move together, there's code repetition here
export const INIT_GAME = 'init_game';
export const MOVE = 'move';
export const OPPONENT_DISCONNECTED = 'opponent_disconnected';
export const GAME_OVER = 'game_over';
export const JOIN_ROOM = 'join_room';
export const GAME_JOINED = 'game_joined';
export const GAME_ALERT = 'game_alert';
export const GAME_ADDED = 'game_added';
export const USER_TIMEOUT = 'user_timeout';
export const GAME_TIME = 'game_time';

export interface IMove {
    from: Square; to: Square; piece: string
}

const moveAudio = new Audio(MoveSound);

interface Metadata {
  blackPlayer: { id: string; name: string };
  whitePlayer: { id: string; name: string };
}

export const Game = () => {
  const socket = useSocket();
  const { gameId } = useParams();
  const user = useUser();

  const navigate = useNavigate();
  // Todo move to store/context
  const [chess, _setChess] = useState(new Chess());
  const [board, setBoard] = useState(chess.board());
  const [added, setAdded] = useState(false);
  const [started, setStarted] = useState(false);
  const [gameMetadata, setGameMetadata] = useState<Metadata | null>(null);
  const [result, setResult] = useState<
    | 'WHITE_WINS'
    | 'BLACK_WINS'
    | 'DRAW'
    | typeof OPPONENT_DISCONNECTED
    | typeof USER_TIMEOUT
    | null
  >(null);
  const [moves, setMoves] = useState<IMove[]>([]);
  const [player1TimeConsumed, setPlayer1TimeConsumed] = useState(0);
  const [player2TimeConsumed, setPlayer2TimeConsumed] = useState(0);
  const [gameMode, setGameMode] = useState('rapid');
  const [isSelectFocused, setIsSelectFocused] = useState(false);

  const GAME_TIME_MS = {
    bullet: 1 * 60 * 1000, 
    blitz: 3 * 60 * 1000, 
    rapid: 10 * 60 * 1000, 
  }[gameMode] || 10 * 60 * 1000;

  useEffect(() => {
    if (!socket) {
      return;
    }
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case GAME_ADDED:
          setAdded(true);
          break;
        case INIT_GAME:
          setBoard(chess.board());
          setStarted(true);
          navigate(`/game/${message.payload.gameId}`);
          setGameMetadata({
            blackPlayer: message.payload.blackPlayer,
            whitePlayer: message.payload.whitePlayer,
          });
          break;
        case MOVE:
          const { move, player1TimeConsumed, player2TimeConsumed } = message.payload;
          setPlayer1TimeConsumed(player1TimeConsumed);
          setPlayer2TimeConsumed(player2TimeConsumed);
          const moves = chess.moves({ verbose: true });
          //TODO: Fix later
          if (
            moves.map((x) => JSON.stringify(x)).includes(JSON.stringify(move))
          ) {
            return;
          }
          console.log(move);
          if (isPromoting(chess, move.from, move.to)) {
            chess.move({
              from: move.from,
              to: move.to,
              promotion: 'q',
            });
          } else {
            chess.move({ from: move.from, to: move.to });
          }
          moveAudio.play();
          setBoard(chess.board());
          const piece=chess.get(move.to)?.type
          setMoves(moves => [...moves,{from:move.from,to:move.to,piece}])
          break;
        case GAME_OVER:
          setResult(message.payload.result);
          break;

        case OPPONENT_DISCONNECTED:
          setResult(OPPONENT_DISCONNECTED);
          break;

        case USER_TIMEOUT:
          setResult(message.payload.win);
          break;

        case GAME_JOINED:
          setGameMetadata({
            blackPlayer: message.payload.blackPlayer,
            whitePlayer: message.payload.whitePlayer,
          });
          setPlayer1TimeConsumed(message.payload.player1TimeConsumed);
          setPlayer2TimeConsumed(message.payload.player2TimeConsumed);
          console.error(message.payload)
          setStarted(true);
          setMoves(message.payload.moves);
          message.payload.moves.map((x: Move) => {
            if (isPromoting(chess, x.from, x.to)) {
              chess.move({ ...x, promotion: 'q' });
            } else {
              chess.move(x);
            }
          });
          setBoard(chess.board());
          break;

        case GAME_TIME:
          if (message.payload.player2UserId === user.id) {
            setMyTimer(message.payload.player2Time);
            setOppotentTimer(message.payload.player1Time);
          } else {
            setMyTimer(message.payload.player1Time);
            setOppotentTimer(message.payload.player2Time);
          }
          break;

        default:
          alert(message.payload.message);
          break;
      }
    };

    if (gameId !== 'random') {
      socket.send(
        JSON.stringify({
          type: JOIN_ROOM,
          payload: {
            gameId,
          },
        }),
      );
    }
  }, [chess, socket]);

  useEffect(() => {
    if (started) {
      const interval = setInterval(() => {
        if (
          chess.turn() === 'w'
        ) {
          setPlayer1TimeConsumed((p) => p + 100);
        } else {
          setPlayer2TimeConsumed((p) => p + 100);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [started, gameMetadata, user]);

  const getTimer = (timeConsumed: number) => {
    const timeLeftMs = GAME_TIME_MS - timeConsumed;
    const minutes = Math.floor(timeLeftMs / (1000 * 60));
    const remainingSeconds = Math.floor((timeLeftMs % (1000 * 60)) / 1000);

    return (
      <div className="text-white">
        Time Left: {minutes < 10 ? '0' : ''}
        {minutes}:{remainingSeconds < 10 ? '0' : ''}
        {remainingSeconds}
      </div>
    );
  };

  if (!socket) return <div>Connecting...</div>;

  return (
    <div className="">
      {result && (
        <div className="justify-center flex pt-4 text-white">
          {result === 'WHITE_WINS' && 'White wins'}
          {result === 'BLACK_WINS' && 'Black wins'}
          {result === 'DRAW' && 'Draw'}
        </div>
      )}
      {started && (
        <div className="justify-center flex pt-4 text-white">
          {(user.id === gameMetadata?.blackPlayer?.id ? 'b' : 'w') ===
          chess.turn()
            ? 'Your turn'
            : "Opponent's turn"}
        </div>
      )}
      <div className="justify-center flex">
        <div className="pt-2 max-w-screen-xl w-full">
          <div className="grid grid-cols-7 gap-4 w-full">
            <div className="col-span-7 lg:col-span-5 w-full text-white">
              <div className="flex justify-center">
                <div>
                  <div className='mb-4'>
                    {started && <div className="flex justify-between">
                      <UserAvatar name={user.id === gameMetadata?.whitePlayer?.id
                          ? gameMetadata?.blackPlayer?.name
                          : gameMetadata?.whitePlayer?.name ?? ''} />
                      {getTimer(user.id === gameMetadata?.whitePlayer?.id ? player2TimeConsumed : player1TimeConsumed)}
                    </div>}
                  </div>
                  <div>
                    <div
                      className={`col-span-4 w-full flex justify-center text-white ${(result === OPPONENT_DISCONNECTED || result === USER_TIMEOUT) && 'pointer-events-none'}`}
                    >
                      <ChessBoard
                        started={started}
                        gameId={gameId ?? ''}
                        myColor={
                          user.id === gameMetadata?.blackPlayer?.id ? 'b' : 'w'
                        }
                        setMoves={setMoves}
                        moves={moves}
                        chess={chess}
                        setBoard={setBoard}
                        socket={socket}
                        board={board}
                      />
                    </div>
                  </div>
                  {started && <div className="mt-4 flex justify-between">
                    <UserAvatar name={user.id === gameMetadata?.blackPlayer?.id
                      ? gameMetadata?.blackPlayer?.name
                      : gameMetadata?.whitePlayer?.name ?? ''} />
                    {getTimer(user.id === gameMetadata?.blackPlayer?.id
                            ? player2TimeConsumed
                            : player1TimeConsumed)}
                  </div>}
                </div>
              </div>
            </div>
            <div className="col-span-2 bg-brown-500 w-full flex justify-center h-[90vh] overflow-scroll mt-10 overflow-y-scroll no-scrollbar">
              {!started && (
                <div className="pt-8">
                  {added ? (
                    <div className="text-white">Waiting</div>
                  ) : (
                    gameId === 'random' && (
                      <div className='flex flex-col gap-2'>
                        <select className="relative bg-[#53524f] cursor-pointer p-4 px-20 py-4 text-white font-bold rounded text-2xl" value={gameMode} onChange={(e) => setGameMode(e.target.value)} onClick={() => setIsSelectFocused(!isSelectFocused)} onBlur={() => setIsSelectFocused(false)}>
                            <option className='text-white font-bold ' value="bullet">Bullet</option>
                            <option className='text-white font-bold' value="blitz">Blitz</option>
                            <option className='text-white font-bold' value="rapid">Rapid</option>
                          </select>
                            <div className="h-8 w-8 ml-11 mt-[1.1rem] absolute ">
                            <svg fill="#22c55e" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" viewBox="0 0 92 92" enable-background="new 0 0 92 92" xmlSpace="preserve" stroke="#22c55e" stroke-width="0.9200000000000002"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round" stroke="#CCCCCC" stroke-width="0.184"></g><g id="SVGRepo_iconCarrier"> <path d="M81.3,19.6c0.8,0.7,1.7,1,2.7,1c1.1,0,2.2-0.4,3-1.3c1.5-1.6,1.4-4.2-0.3-5.7l-5.2-4.7c0,0,0,0,0,0s0,0,0,0l-5.2-4.7 c-1.6-1.5-4.2-1.4-5.6,0.3c-1.5,1.6-1.4,4.2,0.3,5.7l2.2,2l-4,4.5c-4.6-3.4-9.9-5.9-15.7-7.2c-0.1-1.3-0.6-2.7-1.6-4 c-1-1.4-3.1-3-6.9-3.2c-0.1,0-0.1,0-0.2,0c-3.5,0-5.5,1.5-6.6,2.8c-1.2,1.4-1.7,3.1-1.9,4.4C17.8,13.4,4,29.8,4,49.4 c0,22.5,18.3,40.9,40.8,40.9c22.5,0,40.8-18.3,40.8-40.9c0-10.5-4-20.1-10.5-27.4l4-4.5L81.3,19.6z M44.8,82.2 C26.7,82.2,12,67.5,12,49.4s14.7-32.8,32.8-32.8c18.1,0,32.8,14.7,32.8,32.8S62.9,82.2,44.8,82.2z M51.8,49.4c0,3.8-3.2,6.9-7,6.9 c-3.8,0-6.8-3.1-6.8-6.9c0-2.3,1-4.4,3-5.6V27.6c0-2.2,1.8-4,4-4s4,1.8,4,4v16.2C51,45,51.8,47.1,51.8,49.4z"></path> </g></svg>
                            </div>
                          <Button className={`${isSelectFocused ? 'mt-28' : ''}`}
                            onClick={() => {
                              socket.send(
                                JSON.stringify({
                                  type: INIT_GAME,
                                  gameMode
                                }),
                              );
                            }}
                          >
                            Play
                          </Button>
                      </div>
                    )
                  )}
                </div>
              )}
              <div>
                {moves.length > 0 && (
                  <div className="mt-4">
                    <MovesTable moves={moves} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* <UserAvatar name={gameMetadata?.whitePlayer?.name ?? ""} /> */}
      </div>
    </div>
  );
};
