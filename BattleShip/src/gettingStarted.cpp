#define OLC_PGE_APPLICATION
#include "olcPixelGameEngine.h"

#define ROT_IN_RADS 1.5707963267948f

enum GamePiece
{
   blank,
   hit,
   boat,
   submarine,
   destroyer,
   carrier
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

//enum Orientation { upDown = 0, leftRight = 1};
enum Heading {North = 0, East = 1};

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

private:
   bool IsWithinBounds(GamePiece p, Heading head, int x_loc, int y_loc)
   {
      if (x_loc >= width || y_loc >= height || x_loc < 0 || y_loc < 0)
         return false;

      if (head == Heading::East && (x_loc + (int)p - 1) >= width)
         return false;

      if (head == Heading::North && (y_loc + (int)p - 1) >= height)
         return false;

      return true;
   }

   bool IsValidLocation(GamePiece p, Heading head, int startingX_loc, int startingY_loc)
   {
      if (!IsWithinBounds(p, head, startingX_loc, startingY_loc))
         return false;

      for (int i = 0; i < p; ++i)
      {
         if (board[startingY_loc][startingX_loc] != GamePiece::blank)
            return false;
         if (head == Heading::North)
            startingY_loc++;
         else
            startingX_loc++;
      }
      return true;
   }

public:
   bool PlacePiece(GamePiece p, Heading head, int x_loc, int y_loc)
   {
      if (!IsValidLocation(p, head, x_loc, y_loc))
         return false;

      for (int i = 0; i < p; ++i)
      {
         board[y_loc][x_loc] = p;

         if (head == Heading::North)
            y_loc++;
         else
            x_loc++;
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

   bool IsRotated()
   {
      if (this->heading == Heading::North)
         return false;
      else
         return true;
   }

   GamePiece piece;
   bool isPositioned = false;
   std::array<bool, 2> isHitAtIndex = { false };
   olc::vi2d pos{ 0, 150 };
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

public:
   bool OnUserCreate() override
   {
   Ship boat(GamePiece::boat, "../resources/boat.png");
   Ship sub(GamePiece::boat, "../resources/submarine.png");
   playerPieces.push_back(std::move(boat));
   playerPieces.push_back(std::move(sub));


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
      static olc::vi2d pos(0,150);
        
      if (GetKey(olc::Key::RIGHT).bPressed)
         pos.x += 15;

      if (GetKey(olc::Key::LEFT).bPressed)
         pos.x += -15;

      if (GetKey(olc::Key::UP).bPressed)
         pos.y += -15;

      if (GetKey(olc::Key::DOWN).bPressed)
         pos.y += 15;

      if (GetKey(olc::Key::ENTER).bPressed)
      {
         ship.isPositioned = true;
         ++index;
      }
        
      static bool drawRotated = false;
      if (GetKey(olc::Key::R).bPressed)
      {
         drawRotated = !drawRotated;
         ship.heading = (Heading)((int)drawRotated);
      }

      return std::tuple<olc::vi2d, bool>(pos, drawRotated);
   }

   bool OnUserUpdate(float fElapsedTime) override
   {
      Clear(olc::VERY_DARK_BLUE);
      olc::vf2d mouse = { float(GetMouseX()), float(GetMouseY()) };

      for (auto& piece : playerPieces)
      {
         if (!piece.isPositioned)
            continue;

         if (piece.IsRotated())
         {
            auto rotCenter = olc::vi2d(piece.pos.x + piece.center.y, piece.pos.y + piece.center.x);
            DrawRotatedDecal(rotCenter, piece.decal.get(), ROT_IN_RADS, piece.center);
         }
         else
            DrawDecal(piece.pos, piece.decal.get());
      }

      static int pieceIndex = 0;

      if (pieceIndex < playerPieces.size())
      {
         auto [pos, drawRotated] = KeyPressHandler(playerPieces[pieceIndex], pieceIndex);
         if (pieceIndex < playerPieces.size())
         {
            playerPieces[pieceIndex].pos = pos;
            if (drawRotated)
            {
               auto rotCenter = olc::vi2d(playerPieces[pieceIndex].pos.x + playerPieces[pieceIndex].center.y, playerPieces[pieceIndex].pos.y + playerPieces[pieceIndex].center.x);
               DrawRotatedDecal(rotCenter, playerPieces[pieceIndex].decal.get(), ROT_IN_RADS, playerPieces[pieceIndex].center);
            }
            else
               DrawDecal(pos, playerPieces[pieceIndex].decal.get());
         }
      }

      DrawGrid();

      return true;
   }

};

//int WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)
int main()
{
   //Example demo;
   //if (demo.Construct(256, 240, 4, 4))
   //	demo.Start();

   GameBoard gb;


   gb.PlacePiece(GamePiece::carrier, Heading::North, 9, 0);
   gb.PlacePiece(GamePiece::boat, Heading::East, 0, 0);
   gb.PlacePiece(GamePiece::destroyer, Heading::North, 2, 0);
   gb.PlacePiece(GamePiece::submarine, Heading::East, 2, 3);

   gb.PrintBoard();

   BattleShip bs;
   if (bs.Construct(150, 300, 2, 2))
       bs.Start();

   return 0;
}
