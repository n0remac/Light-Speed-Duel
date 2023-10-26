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


def start_game(queue, player_image, ship_initial_position, player_num):
    window = MyGame(queue, player_image, ship_initial_position, player_num)
    arcade.run()

class MyGame(arcade.Window):
    def __init__(self, queue, player_image, ship_initial_position, player_num):
        super().__init__(SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_TITLE)

        self.queue = queue
        self.player_list = arcade.SpriteList()

        # Player setup
        self.player = PlayerShip(player_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
        self.player.center_x, self.player.center_y = ship_initial_position
        self.player_list.append(self.player)

        self.enemy_list = arcade.SpriteList()  # A new sprite list for enemy ships

        # Assuming you are using a different image for the enemy ship, or you can use the player_image
        enemy_image = os.path.join('assets', "ship1.png")  # make sure this file exists

        # Create an enemy ship instance. It won't do anything until updated with real data.
        self.enemy_ship = PlayerShip(enemy_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)  # Assuming 1 and 2 are the player numbers
        self.enemy_list.append(self.enemy_ship)
        

        # Background color
        arcade.set_background_color(arcade.color.BLACK)

    def on_draw(self):
        arcade.start_render()
        self.player_list.draw()
        self.enemy_list.draw() 

        self.player.draw_trajectory()

        # Draw waypoints for visualization
        for waypoint in self.player.waypoints:
            arcade.draw_circle_filled(waypoint.position[0], waypoint.position[1], 3, arcade.color.BLUE)

    def on_update(self, delta_time):
        self.player_list.update()
            
        # Update the game state with the enemy ship's new position, velocity, etc.
        # self.enemy_list.update()

        self.player.update_enemy_position(self.enemy_ship, queue)


    def on_mouse_press(self, x, y, button, modifiers):
        if button == arcade.MOUSE_BUTTON_LEFT:
            # Create a waypoint at the mouse position and include the current ship's position.
            ship_position = (self.player.center_x, self.player.center_y)
            waypoint = Waypoint((x, y), ship_position)
            self.player.waypoints.append(waypoint)


def main():
    window = MyGame()
    arcade.run()


if __name__ == "__main__":
    # Create a Queue to share data between game instances
    queue = Queue()

    # Define initial positions for the ships
    ship1_initial_position = (SCREEN_WIDTH / 4, SCREEN_HEIGHT / 2)
    ship2_initial_position = (3 * SCREEN_WIDTH / 4, SCREEN_HEIGHT / 2)

    # Assets for the ships
    ship1_image = os.path.join(asset_folder, "ship1.png")  # assume you have ship1.png and ship2.png in your assets folder
    ship2_image = os.path.join(asset_folder, "ship2.png")

    # Create two game processes
    game1 = Process(target=start_game, args=(queue, ship1_image, ship1_initial_position, 1))
    game2 = Process(target=start_game, args=(queue, ship2_image, ship2_initial_position, 2))

    # Start the games
    game1.start()
    game2.start()

    # Join the games, so the main thread waits for these processes to complete
    game1.join()
    game2.join()
