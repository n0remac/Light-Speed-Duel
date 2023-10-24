import math
import arcade

class PlayerShip(arcade.Sprite):
    def __init__(self, image, scale, max_speed, max_acceleration, player_num):
        super().__init__(image, scale)
        self.player_num = player_num
        self.max_speed = max_speed
        self.max_acceleration = max_acceleration
        self.velocity_x = 0
        self.velocity_y = 0
        self.angle_speed = 100  # Speed the ship rotates. Adjust as needed.

        self.waypoints = []


    def update(self):
        if self.waypoints:
            # If there are waypoints, set the first one as the current target.
            target = self.waypoints[0].position

            # Calculate the desired angle.
            start_x, start_y = self.position
            target_x, target_y = target
            desired_angle_rad = math.atan2(target_y - start_y, target_x - start_x)
            desired_angle_deg = math.degrees(desired_angle_rad)

            # Calculate the difference in angles and adjust the ship's angle.
            delta_angle = desired_angle_deg - self.angle
            while delta_angle > 180:
                delta_angle -= 360
            while delta_angle < -180:
                delta_angle += 360

            if abs(delta_angle) < self.angle_speed:
                self.angle = desired_angle_deg
            elif delta_angle > 0:
                self.angle += self.angle_speed
            else:
                self.angle -= self.angle_speed

            # Recalculate the angle after potential correction.
            new_angle_rad = math.radians(self.angle)

            # Calculate the distance to the next waypoint.
            distance = arcade.get_distance(self.center_x, self.center_y, target_x, target_y)

            # Manage acceleration and deceleration.
            if distance > 10:  # Accelerate if far from the waypoint.
                # Accelerate in the direction the ship is facing.
                self.velocity_x += math.cos(new_angle_rad) * self.max_acceleration
                self.velocity_y += math.sin(new_angle_rad) * self.max_acceleration

                # Clamp at max speed.
                speed = math.sqrt(self.velocity_x ** 2 + self.velocity_y ** 2)
                if speed > self.max_speed:
                    scale = self.max_speed // speed
                    self.velocity_x *= scale
                    self.velocity_y *= scale

            else:  # Decelerate if close to the waypoint.
                deceleration_vector = (-self.velocity_x, -self.velocity_y)
                self.velocity_x += deceleration_vector[0] * self.max_acceleration // 2
                self.velocity_y += deceleration_vector[1] * self.max_acceleration // 2

            # Move the ship.
            self.center_x += self.velocity_x
            self.center_y += self.velocity_y

            # Remove the waypoint if it's reached.
            if distance < 10:  # This tolerance can be adjusted.
                self.waypoints.pop(0)
                self.velocity_x = 0  # Reset the velocity to avoid drifting.
                self.velocity_y = 0

        super().update()  # Call the parent class update method.

    def draw_trajectory(self):
        current_x, current_y = self.position
        current_velocity_x, current_velocity_y = self.velocity_x, self.velocity_y

        # Project the ship's position based on its velocity.
        projected_x = current_x + current_velocity_x
        projected_y = current_y + current_velocity_y

        # If there are waypoints, draw lines towards each of them.
        previous_point = (projected_x, projected_y)
        for waypoint in self.waypoints:
            next_point = waypoint.position
            arcade.draw_line(previous_point[0], previous_point[1], next_point[0], next_point[1], arcade.color.WHITE, 2)
            previous_point = next_point
    
    def update_from_data(self, data):
        self.center_x = data['x']
        self.center_y = data['y']
        self.velocity_x = data['velocity_x']
        self.velocity_y = data['velocity_y']