import { Schema } from '@effect/schema';

// Define a user with an ID and name
export class User extends Schema.Class<User>('User')({
  id: Schema.String, // User's ID as a string
  name: Schema.String, // User's name as a string
}) {}

// Request to retrieve a list of users
export class UserList extends Schema.TaggedRequest<UserList>()(
  'UserList',
  Schema.Never, // Indicates that no errors are expected
  Schema.Array(User), // Specifies that the response is an array of Users
  {},
) {}

// Request to retrieve a user by ID
export class UserById extends Schema.TaggedRequest<UserById>()(
  'UserById',
  Schema.String, // Indicates that errors, if any, will be returned as strings
  User, // Specifies that the response is a User
  {
    id: Schema.String,
  },
) {}

// Request to create a new user
export class UserCreate extends Schema.TaggedRequest<UserCreate>()(
  'UserCreate',
  Schema.Never, // Indicates that no errors are expected
  User, // Specifies that the response is a User
  {
    name: Schema.String,
  },
) {}
