#define OLC_PGE_APPLICATION
#include "olcPixelGameEngine.h"

#define ROT_IN_RADS 1.5707963267948f
#define PIXEL_WIDTH 15


enum GamePiece
{
   blank,
   bomb,
   boat,
   submarine,
   destroyer,
   carrier,
   miss,
   hit
};

static char GetGamePieceChar(GamePiece p)
{
   switch (p)
   {
   case 0:
      return '_';
   case 1:
      return '*';
   case 2:
      return 'B';
   case 3:
      return 'S';
   case 4:
      return 'D';
   case 5:
      return 'C';
   default:
      return 'X';
   }
}

enum Heading {North = 0, East = 1};
enum Player {me = 0, enemy = 1};

class GameBoard
{
public:
   GameBoard()
   {
      int t = 48;
      for (int i = 0; i < height; ++i)
         for (int j = 0; j < width; ++j)
            board[i][j] = GamePiece::blank;
   }

   bool IsWithinBounds(GamePiece p, Heading head, olc::vi2d loc)
   {
      if (loc.x >= width || loc.y >= height || loc.x < 0 || loc.y < 0)
         return false;

      if (head == Heading::East && (loc.x + (int)p - 1) >= width)
         return false;

      if (head == Heading::North && (loc.y + (int)p - 1) >= height)
         return false;

      return true;
   }

   bool IsValidLocation(GamePiece p, Heading head, olc::vi2d loc)
   {
      if (!IsWithinBounds(p, head, loc))
         return false;

      for (int i = 0; i < p; ++i)
      {
         if (board[loc.y][loc.x] != GamePiece::blank)
            return false;
         if (head == Heading::North)
            loc.y++;
         else
            loc.x++;
      }
      return true;
   }

   bool PlacePiece(GamePiece p, Heading head, olc::vi2d ind)
   {
      if (!IsValidLocation(p, head, ind))
         return false;

      for (int i = 0; i < p; ++i)
      {
         board[ind.y][ind.x] = p;

         if (head == Heading::North)
            ind.y++;
         else
            ind.x++;
      }
      return true;
   }

   GamePiece GetPiece(int x, int y)
   {
      return board[y][x];
   }

   void PrintBoard()
   {
      for (int i = 0; i < height; ++i)
      {
         for (int j = 0; j < width; ++j)
         {
            std::cout << GetGamePieceChar(board[i][j]) << " ";
         }
         std::cout << "\n";
      }
   }

private:
   const int width = 10;
   const int height = 10;
   std::array<std::array<GamePiece, 10>, 10> board;
};

class Ship
{
public:
   Ship(GamePiece p, const std::string& spriteLoc) :
      piece(p),
      sprite(std::unique_ptr<olc::Sprite>(new olc::Sprite(spriteLoc)))
   {
      decal = std::unique_ptr<olc::Decal>(new olc::Decal(sprite.get()));
      center = olc::vi2d(sprite->width / 2, sprite->height / 2);
   }
   bool IsSunk() const
   {
      bool sunk = false;
      for (auto& i : isHitAtIndex)
         sunk &= i;
      return sunk;
   }

   bool IsRotated() const
   {
      if (this->heading == Heading::North)
         return false;
      else
         return true;
   }

   GamePiece piece;
   bool isPositioned = false;
   std::array<bool, 2> isHitAtIndex = { false };
   olc::vi2d pos{ 0, 0 };
   Heading heading = Heading::North;

   std::unique_ptr<olc::Sprite> sprite = nullptr;
   std::unique_ptr<olc::Decal> decal = nullptr;
   olc::vi2d center;
};



class BattleShip : public olc::PixelGameEngine
{
public:
   BattleShip()
   {
      sAppName = "BattleShip";
   }

   std::vector<Ship> playerPieces;
   GameBoard gameboard;

public:
   bool OnUserCreate() override
   {
   Ship boat(GamePiece::boat, "../resources/boat.png");
   Ship sub(GamePiece::submarine, "../resources/submarine.png");
   Ship destroyer(GamePiece::destroyer, "../resources/destroyer.png");
   Ship carrier(GamePiece::carrier, "../resources/carrier.png");
   playerPieces.push_back(std::move(boat));
   playerPieces.push_back(std::move(sub));
   playerPieces.push_back(std::move(destroyer));
   playerPieces.push_back(std::move(carrier));
   

   return true;
   }

   void DrawGrid()
   {
      // Erase previous frame
      Clear(olc::BLUE);
      int w = ScreenWidth();
      int h = ScreenHeight();
      int iw = w / 10;
      int ih = h / 20;

      // Draw grid
      for (auto i = 1; i < 20; ++i)
      {
         auto p = olc::WHITE;
         if (i == 10)
         p = olc::DARK_RED;
         DrawLine(i * iw, 0, i * iw, h, p);
         DrawLine(0, i * ih, w, i * ih, p);
      }
   }

   std::tuple<olc::vi2d, bool> KeyPressHandler(Ship& ship, int& index)
   {
       static olc::vi2d pos(0, 0);
       static bool drawRotated = false;

       if (GetKey(olc::Key::RIGHT).bPressed)
          if (gameboard.IsWithinBounds(ship.piece, ship.heading, {pos.x + 1, pos.y}))
            pos.x += 1;

           
       if (GetKey(olc::Key::LEFT).bPressed)
          if (gameboard.IsWithinBounds(ship.piece, ship.heading, { pos.x - 1, pos.y }))
            pos.x += -1;

       if (GetKey(olc::Key::UP).bPressed)
          if (gameboard.IsWithinBounds(ship.piece, ship.heading, { pos.x, pos.y - 1}))
            pos.y += -1;

       if (GetKey(olc::Key::DOWN).bPressed)
          if (gameboard.IsWithinBounds(ship.piece, ship.heading, { pos.x, pos.y + 1 }))
            pos.y += 1;

       if (GetKey(olc::Key::ENTER).bPressed && gameboard.IsValidLocation(ship.piece, ship.heading, pos))
       {
           gameboard.PlacePiece(ship.piece, ship.heading, pos);
           ship.isPositioned = true;
           ++index;
           drawRotated = false;
       }

       if (GetKey(olc::Key::R).bPressed)
       {
           drawRotated = !drawRotated;
           ship.heading = (Heading)((int)drawRotated);
       }

       return std::tuple<olc::vi2d, bool>(pos, drawRotated);
   }

    olc::vi2d IndexToPixelLoc(const olc::vi2d ind, const Ship& piece) const
    {
        olc::vi2d offset;
        if (piece.IsRotated())
            offset = { ind.x * PIXEL_WIDTH + piece.center.y, ind.y * PIXEL_WIDTH + piece.center.x + ScreenHeight() / 2 };
        else
            offset = { ind.x * PIXEL_WIDTH, ind.y * PIXEL_WIDTH + ScreenHeight() / 2 };
        return offset;
    }

    void DrawGamePieces()
    {
       Clear(olc::VERY_DARK_BLUE);
       for (auto& piece : playerPieces)
       {
          if (!piece.isPositioned)
             continue;

          auto loc = IndexToPixelLoc(piece.pos, piece);
          if (piece.IsRotated())
             DrawRotatedDecal(loc, piece.decal.get(), ROT_IN_RADS, piece.center);
          else
             DrawDecal(loc, piece.decal.get());
       }

       static int pieceIndex = 0;

       if (pieceIndex < playerPieces.size())
       {
          auto [pos, drawRotated] = KeyPressHandler(playerPieces[pieceIndex], pieceIndex);
          if (pieceIndex < playerPieces.size())
          {
             playerPieces[pieceIndex].pos = pos;
             auto loc = IndexToPixelLoc(playerPieces[pieceIndex].pos, playerPieces[pieceIndex]);
             if (drawRotated)
                DrawRotatedDecal(loc, playerPieces[pieceIndex].decal.get(), ROT_IN_RADS, playerPieces[pieceIndex].center);
             else
                DrawDecal(loc, playerPieces[pieceIndex].decal.get());
          }
       }
       
       if (pieceIndex >= playerPieces.size())

    }

   bool OnUserUpdate(float fElapsedTime) override
   {
      DrawGamePieces();
      DrawGrid();

      return true;
   }

};

//int WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)
int main()
{
   BattleShip bs;
   if (bs.Construct(150, 300, 2, 2))
       bs.Start();

   bs.gameboard.PrintBoard();

   return 0;
}
