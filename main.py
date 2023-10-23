import arcade
import os

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


class MyGame(arcade.Window):
    def __init__(self):
        super().__init__(SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_TITLE)

        # Sprite lists
        self.player_list = arcade.SpriteList()

        # Set up the player
        self.player = PlayerShip(os.path.join(asset_folder, "ship.png"), scale=0.5, max_speed=5, max_acceleration=.01)  # Add your ship image in 'assets' folder
        self.player.center_x = SCREEN_WIDTH / 2
        self.player.center_y = SCREEN_HEIGHT / 2
        self.player_list.append(self.player)

        # Background color
        arcade.set_background_color(arcade.color.BLACK)

    def on_draw(self):
        arcade.start_render()
        self.player_list.draw()

        self.player.draw_trajectory()

        # Draw waypoints for visualization
        for waypoint in self.player.waypoints:
            arcade.draw_circle_filled(waypoint.position[0], waypoint.position[1], 3, arcade.color.BLUE)

    def on_update(self, delta_time):
        self.player.update()

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
    main()
