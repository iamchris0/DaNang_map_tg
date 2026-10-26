from fastapi import APIRouter

from app.api.routes import admin, admin_images, admin_telegram, auth, catalog, health

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(catalog.router)
api_router.include_router(admin.router)
api_router.include_router(admin_images.router)
api_router.include_router(admin_telegram.router)
