/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "notes",
    type: "base",
    schema: [
      {
        name: "text",
        type: "text",
        required: true,
      },
      {
        name: "time",
        type: "number",
        required: true,
      },
      {
        name: "edited",
        type: "bool",
      },
      {
        name: "user",
        type: "relation",
        required: true,
        options: {
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          maxSelect: 1,
        },
      },
    ],
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("notes");
  return app.delete(collection);
});
