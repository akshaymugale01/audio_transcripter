class CreateTranscriptions < ActiveRecord::Migration[8.0]
  def change
    create_table :transcriptions do |t|
      t.string :session_id, null: false
      t.text :raw_text
      t.text :summary
      t.string :status, default: 'processing'
      t.text :speaker_data
      t.json :metadata
      t.integer :duration_seconds

      t.timestamps
    end

    add_index :transcriptions, :session_id
    add_index :transcriptions, :status
  end
end
