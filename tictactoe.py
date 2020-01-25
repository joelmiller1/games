# -*- coding: utf-8 -*-
"""
Created on Thu Jan 23 09:59:06 2020

@author: Joel Miller
"""
import random

xReplace = lambda b,p: b[:p] + 'X' + b[p+1:]
oReplace = lambda b,p: b[:p] + 'O' + b[p+1:]

board = "\n _ _ _\n|_|_|_|\n|_|_|_|\n|_|_|_|"
position = [9,11,13,17,19,21,25,27,29]
availablePositions = [1,2,3,4,5,6,7,8,9]
xPos = []
oPos = []

def oMoveRandom(board,availablePositions,oPos):
    oPlace = random.randint(1,9)
    while oPlace not in availablePositions:
        oPlace = random.randint(1,9)
    oPos.append(oPlace)
    availablePositions.remove(oPlace)
    board = oReplace(board,position[oPlace-1])
    return board, availablePositions, oPos

def checkWin(Pos):
    winCombo = [[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]]
    if len(Pos) > 2:
        for i in winCombo:
            temp = []
            for j in Pos:
                if j in i:
                    temp.append(j)
            temp = sorted(temp)
            if temp in winCombo:
                return 1
            
    return 0
    

while True:
    print(board)
    print("available Positions: ")
    print(availablePositions)
    enteredXPos = input("enter position of where to move: ")
    try:
        enteredXPos = int(enteredXPos)
    except:
        "wrong type of input"
    
    if enteredXPos in availablePositions:
        xPos.append(enteredXPos)
        availablePositions.remove(enteredXPos)
        board = xReplace(board, position[enteredXPos-1])
        win = checkWin(xPos)
        if win:
            print(board)
            print("you won!")
            break
        if not availablePositions:
            print(board)
            print("cats game")
            break
        board, availablePositions, oPos = oMoveRandom(board,availablePositions,oPos)
        win = checkWin(oPos)
        if win:
            print(board)
            print("you lost :(")
            break
        
    else:
        print("invalid move")
        break

print("end game")
        

