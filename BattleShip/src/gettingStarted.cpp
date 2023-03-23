#define OLC_PGE_APPLICATION
#include "olcPixelGameEngine.h"

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

enum Orientation { upDown = 0, leftRight = 1};

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
	bool IsWithinBounds(GamePiece p, Orientation orient, int x_loc, int y_loc)
	{
		if (x_loc >= width || y_loc >= height || x_loc < 0 || y_loc < 0)
			return false;

		if (orient == Orientation::leftRight && (x_loc + (int)p - 1) >= width)
			return false;

		if (orient == Orientation::upDown && (y_loc + (int)p - 1) >= height)
			return false;

		return true;
	}

	bool IsValidLocation(GamePiece p, Orientation orient, int startingX_loc, int startingY_loc)
	{
		if (!IsWithinBounds(p, orient, startingX_loc, startingY_loc))
			return false;

		for (int i = 0; i < p; ++i)
		{
			if (board[startingY_loc][startingX_loc] != GamePiece::blank)
				return false;
			if (orient == Orientation::upDown)
				startingY_loc++;
			else
				startingX_loc++;
		}
		return true;
	}

public:
	bool PlacePiece(GamePiece p, Orientation orient, int x_loc, int y_loc)
	{
		if (!IsValidLocation(p, orient, x_loc, y_loc))
			return false;

		for (int i = 0; i < p; ++i)
		{
			board[y_loc][x_loc] = p;

			if (orient == Orientation::upDown)
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


class BattleShip : public olc::PixelGameEngine
{
public:
	 BattleShip()
	 {
		  sAppName = "BattleShip";
	 }

	 olc::Sprite* boatSprite = nullptr;
	 olc::Decal* boatDecal = nullptr;

public:
	 bool OnUserCreate() override
	 {
		  boatSprite = new olc::Sprite("../resources/submarine.png");
		  boatDecal = new olc::Decal(boatSprite);
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

	 void KeyPressHandler()
	 {
		  static olc::vi2d pos(0,150);
		  
		  if (GetKey(olc::Key::RIGHT).bPressed)
		  {
				pos.x += 15;
				std::cout << pos << "\n";
		  }
		  if (GetKey(olc::Key::LEFT).bPressed)
		  {
				pos.x += -15;
				std::cout << pos << "\n";
		  }
		  if (GetKey(olc::Key::UP).bPressed)
		  {
				pos.y += -15;
				std::cout << pos << "\n";
		  }
		  if (GetKey(olc::Key::DOWN).bPressed)
		  {
				pos.y += 15;
				std::cout << pos << "\n";
		  }
		  static bool drawRotated = false;
		  if (GetKey(olc::Key::R).bPressed)
				drawRotated = !drawRotated;


		  if (drawRotated)
		  {
				olc::vi2d center(float(boatSprite->width) / 2.0f, float(boatSprite->height / 2.0f));
				olc::vi2d rotPos( pos.x + 15, pos.y + 7 );
				DrawRotatedDecal(rotPos, boatDecal, 90 * 3.14159 / 180, center);
		  }
				
		  else
				DrawDecal(pos, boatDecal);
	 }

	 bool OnUserUpdate(float fElapsedTime) override
	 {
		  Clear(olc::VERY_DARK_BLUE);
		  olc::vf2d mouse = { float(GetMouseX()), float(GetMouseY()) };

		  DrawGrid();

		  KeyPressHandler();

		  //SetPixelMode(olc::Pixel::ALPHA);
		  //DrawSprite(mouse, test);
		  //SetPixelMode(olc::Pixel::NORMAL);


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


	gb.PlacePiece(GamePiece::carrier, Orientation::upDown, 9, 0);
	gb.PlacePiece(GamePiece::boat, Orientation::leftRight, 0, 0);
	gb.PlacePiece(GamePiece::destroyer, Orientation::upDown, 2, 0);
	gb.PlacePiece(GamePiece::submarine, Orientation::leftRight, 2, 3);

	gb.PrintBoard();

	BattleShip bs;
	if (bs.Construct(150, 300, 2, 2))
		 bs.Start();

	return 0;
}
