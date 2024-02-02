/**
 * up - runs migration.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
    await knex.schema.createTable('oauth-mapping', table => {
      table.increments('id').primary();
      table.string('backstageID');
      table.string('mtaOAuthRefreshToken');
    });
    await knex.schema.createTable('entity-application-mapping', table => {
      table.increments('id').primary();
      table.string('entityUID');
      table.string('mtaApplication');
    })
  };
  
  /**
   * down - reverts(undo) migration.
   *
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = async function down(knex) {
    await knex.schema.dropTable('oauth-mapping');
    await knex.schema.dropTable('mtaApplication');
  };