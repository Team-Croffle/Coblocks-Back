# Coblocks Back-end

## Overview

...

## Features

- User authentication (login and registration)
- Create and manage classrooms
- Join and leave classrooms
- Real-time messaging within classrooms
- User profile management

## Project Structure

```
back-end
├── src
│   ├── app.js                  # Entry point of the application
│   ├── controllers             # Contains controller files for handling requests
│   │   ├── authController.js   # Handles user authentication
│   │   ├── classroomController.js # Manages classroom operations
│   │   └── userController.js    # Manages user-related operations
│   ├── models                  # Contains model files for database interaction
│   │   ├── Classroom.js        # Defines the Classroom model
│   │   └── User.js             # Defines the User model
│   ├── routes                  # Contains route definitions
│   │   ├── api.js              # API routes setup
│   │   └── auth.js             # Authentication routes setup
│   ├── socket                  # WebSocket related files
│   │   ├── events.js           # WebSocket events constants
│   │   └── handlers.js         # WebSocket event handlers
│   ├── utils                   # Utility functions
│   │   └── logger.js           # Logger utility
│   └── config.js               # Configuration settings
├── public                      # Public assets
│   ├── css
│   │   └── style.css           # CSS styles
│   ├── js
│   │   └── client.js           # Client-side JavaScript
│   └── index.html              # Main HTML file
├── package.json                # NPM configuration file
├── .env.                       # Example environment variables
└── README.md                   # Project documentation
```

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   ```
2. Navigate to the project directory:
   ```
   cd back-end
   ```
3. Install the dependencies:
   ```
   npm install
   ```

## Usage

1. Modify a `.env` file and configure your environment variables.
2. Start the application:
   ```
   npm start
   ```
3. Open your browser and navigate to `http://localhost:3000` to access the application.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License.
