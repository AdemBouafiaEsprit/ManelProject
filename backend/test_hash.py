import bcrypt

original_hash = b"$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW"
new_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt())

print("Testing original hash:", bcrypt.checkpw(b"admin123", original_hash))
print("New hash generated:", new_hash.decode())
