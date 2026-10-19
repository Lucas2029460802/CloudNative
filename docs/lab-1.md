# Cloud-Native Software Technology — Lab 1: Venue Reservation System Development and Docker Containerization

## I. Lab Topic

Develop a simple venue reservation system, and use Docker and Docker Compose to complete the containerized deployment of the frontend, backend API, and database.

This lab is the first phase of the course's three-phase project. Subsequent labs will add Workers, Kubernetes orchestration, and observability capabilities to this system. Therefore, each group should maintain a complete code repository and a clear project structure.

## II. Lab Objectives

After completing this lab, students should be able to:

1. Develop a simple application containing a frontend, Web API, and relational database;
2. Implement communication between the frontend and backend using a Web API;
3. Persist venue and reservation data using a relational database;
4. Understand the relationships between applications, processes, images, and containers;
5. Write separate Dockerfiles for the frontend and backend;
6. Define and run a multi-container application using Docker Compose;
7. Use environment variables to externalize configuration;
8. Use Volumes to persist database data;
9. Verify that others can rebuild and run the system according to the documentation.

## III. Organization Method

- Complete the lab in groups;
- It is recommended that each group create a Git repository and synchronize the code;
- Generative AI may be used to assist with requirements analysis, coding, configuration writing, and troubleshooting, but group members must be able to explain, modify, and verify the final submitted code and configuration.

# Part One: Lab 1 Practical Requirements

## I. Overall System Requirements

### 1.1 System Runtime Architecture

The system must contain at least three running components:

```
Browser
   |
   v
Frontend (frontend)
   |
  HTTP
   |
   v
Backend API (api)
   |
   v
Relational Database (database)
```

The three components should have the following responsibilities:

| Component  | Responsibility                                                  |
| ---------- | --------------------------------------------------------------- |
| `frontend` | Provide the user interface and call the backend Web API         |
| `api`      | Implement business rules, parameter validation, and data access |
| `database` | Persist venue and reservation data                              |

### 1.2 Technology Stack

- The backend framework and relational database may be chosen freely;
- The frontend may use a mainstream framework, or simple HTML, CSS, and JavaScript;
- The interface must use an HTTP Web API;
- Docker must be used as the container tool;
- Docker Compose v2 must be used for the multi-container application.

## II. Business Function Requirements

### 2.1 Venue Entity

A venue must contain at least the following information:

- Venue ID;
- Venue name;
- Location;
- Maximum capacity;
- Opening hours;
- Venue status, such as open or disabled.

### 2.2 Reservation Entity

A reservation must contain at least the following information:

- Reservation ID;
- Venue ID;
- Name of the person making the reservation or organization;
- Reservation date;
- Start time;
- End time;
- Purpose of use;
- Reservation status, such as valid or canceled.

### 2.3 Required Business Functions

The system must support at least:

1. Query the venue list;
2. Query venue details;
3. Create a venue;
4. Create a reservation;
5. Query the reservation list;
6. Query reservation details;
7. Cancel a reservation;
8. Validate venue, time, and input data when creating a reservation;
9. Reject conflicting reservations for the same venue during the same time period.

## III. Backend Web API Requirements

The backend must provide at least the following equivalent capabilities. The paths may be adjusted, but the actual interfaces must be listed in the README and lab report. For example:

```
GET    /api/venues
GET    /api/venues/{id}
POST   /api/venues
POST   /api/reservations
GET    /api/reservations
GET    /api/reservations/{id}
DELETE /api/reservations/{id}
```

An explicit cancellation endpoint may also be used instead of `DELETE`:

```
POST /api/reservations/{id}/cancel
```

The API should satisfy the following requirements:

1. Use JSON as the primary request and response format;
2. Validate required fields, time ranges, and venue status;
3. Return clear errors for venues or reservations that do not exist;
4. Return clear errors for reservation conflicts;
5. Do not return exception stack traces directly to ordinary users;
6. Data must be written to the relational database and cannot be stored only in process memory;
7. Database connection information must be read from environment variables or external configuration.

It is recommended to use HTTP status codes with clear semantics:

| Scenario                         | Recommended Status Code     |
| -------------------------------- | --------------------------- |
| Successful query or cancellation | `200 OK`                    |
| Successful creation              | `201 Created`               |
| Request parameter error          | `400 Bad Request`           |
| Resource does not exist          | `404 Not Found`             |
| Reservation time conflict        | `409 Conflict`              |
| Unhandled server error           | `500 Internal Server Error` |

## IV. Frontend Requirements

The frontend must provide at least the following interactions:

1. Display the venue list;
2. View basic venue information;
3. Create a venue reservation;
4. Display reservation records;
5. Cancel a reservation;
6. Display reservation success information;
7. Display failure information such as time conflicts and parameter errors.

Frontend requirements:

- Call the backend API through HTTP;
- Do not connect directly to the database;
- Do not implement the sole reservation conflict determination on the frontend;
- The backend address may be configured through build parameters, environment configuration, reverse proxy, or other reasonable methods;
- The pages only need to complete business operations; a complex UI is not required.

## V. Database Requirements

1. A relational database may be chosen freely;
2. At least a venue table and a reservation table must be included;
3. Clearly define primary keys and the association between venues and reservations;
4. Provide database initialization scripts, migration files, or a framework migration mechanism;
5. Provide a small amount of venue seed data for demonstration;
6. Reservation data must be persisted;
7. Reservation cancellation may use logical cancellation or physical deletion, but this must be explained in the design and report;
8. Database passwords must not be hardcoded in the source code or Docker images.

## VI. Dockerfile Requirements

### 6.1 Frontend Dockerfile

The following should be achieved:

- The frontend image can be built independently;
- The frontend build artifacts can be served through a container;
- Local dependency caches and unrelated files are not copied into the image;
- Use `.dockerignore` appropriately;
- Clearly specify the container's listening port.

### 6.2 Backend Dockerfile

The following should be achieved:

- The backend image can be built independently;
- The final runtime image should not contain unnecessary source code, compilation tools, or caches;
- Use multi-stage builds to separate the build and runtime processes;
- Read database configuration through environment variables;
- Do not write database passwords into the image;
- Use `.dockerignore` appropriately;
- It is recommended to run as a non-root user.

### 6.3 Image Requirements

- Use clear and reasonable base image versions;
- Image names and tags should be meaningful;
- Images do not need to be pushed to a public image repository;
- Image export files do not need to be submitted;
- Ensure that others can rebuild the images from the source code and Dockerfiles.

## VII. Docker Compose Requirements

A `compose.yaml` file should be provided in the project root directory or the `deploy/` directory, defining at least:

```
frontend
api
database
```

### 7.1 Service Requirements

frontend

- Use the frontend image;
- Expose an access port to the outside;
- Be able to access `api`;
- Do not directly access `database`.

api

- Use the backend image;
- Be able to connect to the database using the Compose service name;
- Read database connection information from environment variables or external configuration.

database

- Use a standard database image;
- Configure the database name, username, and password through environment variables;
- Use a named Volume or bind-mounted directory to persist data;
- Configure a reasonable `healthcheck`.

### 7.2 Network Requirements

- The frontend, API, and database communicate through the Compose network;
- The API connects to the database using the service name `database` or the actual defined database service name;
- Only ports that genuinely need to be accessed from the host should be exposed externally;
- In principle, the database port does not need to be exposed externally. If it needs to be exposed for development and debugging, this should be explained in the report.

### 7.3 Configuration Requirements

Ordinary configuration may be placed in:

- The `environment` section of `compose.yaml`;
- `.env`;
- Files specified by `env_file`;
- External configuration files supported by the application.

The following must be provided upon submission:

```
.env.example
```

Requirements:

- `.env.example` must contain only variable names and experimental example values;
- The actual `.env` should be added to `.gitignore`;
- Actual account credentials, passwords, Tokens, or access keys must not be submitted;
- Environment-related passwords must not be written into Dockerfiles.

## VIII. Running and Acceptance Requirements

### 8.1 Basic Function Verification

At least complete the following:

1. Open the frontend page;
2. Query the venue list;
3. Create a normal reservation;
4. Query the reservation just created;
5. Create a reservation with a time conflict and confirm that the backend rejects it;
6. Cancel a reservation;
7. Create a new reservation for the same time period after cancellation and confirm that the result conforms to the design.

### 8.2 Container Verification

Execute:

```
docker compose up --build -d
docker compose ps
```

At least confirm:

- The three service containers have been created;
- `frontend` is accessible;
- `api` can connect to `database`;
- The database health check is normal;
- There are no continuously recurring serious errors in the service logs.

### 8.3 Data Persistence Verification

The following procedure is recommended:

1. Create a reservation and record its reservation ID;
2. Execute:

```
docker compose down
```

3\. Start again:

```
docker compose up -d
```

1. Query the reservation and confirm that the data still exists;
2. Use `docker volume ls` to view the project's Volume.

The lab report must record the data persistence verification process and results.

## IX. Submission Format

Each group submits a compressed package or Git repository URL containing the source code, configuration files, etc.

In addition, each group submits a Lab 1 lab report.

Lab report requirements:

- System architecture, database structure, and interface descriptions;
- Dockerfiles and descriptions for each custom service;
- Compose file and its description;
- System deployment, startup, and execution records: these may include the commands used and their execution results;
- Main system use-case procedures and records;
- Division of work among group members and implementation status;
- Problems and resolution processes (optional).

## X. Submission Time

Report submission deadline: November 2, 2026.

Submit to eLearning.
