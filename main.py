import arcade
import os
from multiprocessing import Process, Queue

from ship import PlayerShip
from waypoint import Waypoint

# Constants
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
SCREEN_TITLE = "LightSpeed Duel"

SHIP_SPEED = 2  # Speed of the player ship

# Assets paths
file_path = os.path.dirname(os.path.abspath(__file__))
asset_folder = os.path.join(file_path, "assets")  # Make sure you have an 'assets' folder with the necessary images.


def start_game(queue1, queue2, player1_image, player2_image, ship1_initial_position, ship2_initial_position, player_num):
    window = MyGame(queue1, queue2, player1_image, player2_image, ship1_initial_position, ship2_initial_position, player_num)
    arcade.run()

class MyGame(arcade.Window):
    def __init__(self, queue1, queue2, player1_image, player2_image, ship1_initial_position, ship2_initial_position, player_num):
        super().__init__(SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_TITLE)

        self.player_list = arcade.SpriteList()

        # Player setup
        if player_num == 1:
            self.player1 = PlayerShip(queue1, player1_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
            self.player1.center_x, self.player1.center_y = ship1_initial_position
            
            self.player2 = PlayerShip(queue1, player1_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
            self.player2.center_x, self.player2.center_y = ship2_initial_position
        else:
            self.player1 = PlayerShip(queue2, player2_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
            self.player1.center_x, self.player1.center_y = ship2_initial_position

            self.player2 = PlayerShip(queue2, player2_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
            self.player2.center_x, self.player2.center_y = ship1_initial_position
        
        self.player_list.append(self.player1)
        self.player_list.append(self.player2)

        # self.enemy_list = arcade.SpriteList()  # A new sprite list for enemy ships

        # if player_num == 1:
        #     self.enemy_ship = PlayerShip(queue1, player1_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
        # else:
        #     self.enemy_ship = PlayerShip(queue2, player2_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
        
        # self.enemy_list.append(self.enemy_ship)
        

        # Background color
        arcade.set_background_color(arcade.color.BLACK)

    def on_draw(self):
        arcade.start_render()
        self.player_list.draw()
        # self.enemy_list.draw() 

        self.player1.draw_trajectory()

        # Draw waypoints for visualization
        for waypoint in self.player1.waypoints:
            arcade.draw_circle_filled(waypoint.position[0], waypoint.position[1], 3, arcade.color.BLUE)

    def on_update(self, delta_time):
        self.player_list.update()
            
        # Update the game state with the enemy ship's new position, velocity, etc.
        # self.enemy_list.update()

        # self.player.update_enemy_position(self.enemy_ship, self.enemy_time_delay_ship, self.queue)
        # self.player1.update_enemy_position(self.player2)


    def on_mouse_press(self, x, y, button, modifiers):
        if button == arcade.MOUSE_BUTTON_LEFT:
            # Create a waypoint at the mouse position and include the current ship's position.
            ship_position = (self.player1.center_x, self.player1.center_y)
            waypoint = Waypoint((x, y), ship_position)
            self.player1.waypoints.append(waypoint)


def main():
    window = MyGame()
    arcade.run()


if __name__ == "__main__":
    # Switch to an Event Bus 
    # Create a Queue to share data between game instances
    queue1 = Queue()
    queue2 = Queue()

    # Define initial positions for the ships
    ship1_initial_position = (SCREEN_WIDTH / 4, SCREEN_HEIGHT / 2)
    ship2_initial_position = (3 * SCREEN_WIDTH / 4, SCREEN_HEIGHT / 2)

    # Assets for the ships
    ship1_image = os.path.join(asset_folder, "ship1.png")  # assume you have ship1.png and ship2.png in your assets folder
    ship2_image = os.path.join(asset_folder, "ship2.png")

    # Create two game processes
    game1 = Process(target=start_game, args=(queue1, queue2, ship1_image, ship2_image, ship1_initial_position, ship2_initial_position, 1))
    game2 = Process(target=start_game, args=(queue1, queue2, ship2_image, ship1_image, ship1_initial_position, ship2_initial_position, 2))

    # Start the games
    game1.start()
    game2.start()

    # Join the games, so the main thread waits for these processes to complete
    game1.join()
    game2.join()
