import arcade
import os
import math
import time
from multiprocessing import Process, Queue
from collections import deque

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

        self.queue1 = queue1
        self.queue2 = queue2

        self.time_delay_queue = deque()

        # Player setup
        if player_num == 1:
            self.player1 = PlayerShip(player1_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
            self.player1.center_x, self.player1.center_y = ship1_initial_position
            
            self.player2 = PlayerShip(player2_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
            self.player2.center_x, self.player2.center_y = ship2_initial_position
        else:
            self.player1 = PlayerShip(player1_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
            self.player1.center_x, self.player1.center_y = ship2_initial_position

            self.player2 = PlayerShip(player2_image, scale=0.5, max_speed=5, max_acceleration=.01, player_num=player_num)
            self.player2.center_x, self.player2.center_y = ship1_initial_position
        
        self.player_list.append(self.player1)
        self.player_list.append(self.player2)

        # Background color
        arcade.set_background_color(arcade.color.BLACK)

    def on_draw(self):
        arcade.start_render()
        self.player_list.draw()

        self.player1.draw_trajectory()

        # Draw waypoints for visualization
        for waypoint in self.player1.waypoints:
            arcade.draw_circle_filled(waypoint.position[0], waypoint.position[1], 3, arcade.color.BLUE)

    def on_update(self, delta_time):
        self.player_list.update()
        self.send_position_to_other_process(self.queue1)

        while not self.queue2.empty():
            # update the other player with the queue data
            data = self.queue2.get()

            self.time_delay_queue.append(data)

            time_delay = self.time_delay_queue[0]['time_delay']
            timestamp = self.time_delay_queue[0]['timestamp']
            player2_x = self.time_delay_queue[0]['x']
            player2_y = self.time_delay_queue[0]['y']
            current_time = time.time()

            print(self.player2.player_num, data['time_delay'])
            
            if (timestamp + time_delay) - current_time <= 0:
                data = self.time_delay_queue.popleft()
                
                self.player2.center_x = data['x']
                self.player2.center_y = data['y']

            
            #     data = self.time_delay_queue.popleft()

            
        
    def send_position_to_other_process(self, queue):
        distance = self.calculate_distance_between()
        time_delay = self.calculate_light_speed_delay(distance)

        # current_time = time.time()

        # Prepare data to send
        data_to_send = {
            'x': self.player1.center_x,
            'y': self.player1.center_y,
            'velocity_x': self.player1.velocity_x,
            'velocity_y': self.player1.velocity_y,
            'distance': distance,
            'time_delay': time_delay,
            'timestamp': time.time(),
        }

        # Send data to the other game instance
        queue.put(data_to_send)

    def on_mouse_press(self, x, y, button, modifiers):
        if button == arcade.MOUSE_BUTTON_LEFT:
            # Create a waypoint at the mouse position and include the current ship's position.
            ship_position = (self.player1.center_x, self.player1.center_y)
            waypoint = Waypoint((x, y), ship_position)
            self.player1.waypoints.append(waypoint)

    def calculate_distance_between(self):
        """
        Calculate the Euclidean distance between ships.
        """
        distance = math.sqrt((self.player1.center_x - self.player2.center_x) ** 2 + 
                             (self.player1.center_y - self.player2.center_y) ** 2)
        return distance
    
    def calculate_light_speed_delay(self, distance):
        c = 100
        time_delay = distance / c
        return time_delay


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
    game2 = Process(target=start_game, args=(queue2, queue1, ship2_image, ship1_image, ship1_initial_position, ship2_initial_position, 2))

    # Start the games
    game1.start()
    game2.start()

    # Join the games, so the main thread waits for these processes to complete
    game1.join()
    game2.join()
