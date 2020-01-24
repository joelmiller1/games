# -*- coding: utf-8 -*-
"""
Created on Thu Jan 23 09:59:06 2020

@author: Joel Miller
"""

strReplace = lambda b,p: b[:p] + 'X' + b[p+1:] 

board = "\n______\n|_|_|_|\n|_|_|_|\n|_|_|_|";

position1 = 9;
position2 = 11;
position3 = 13;

print(board)
board = strReplace(board,position2)
print(board)