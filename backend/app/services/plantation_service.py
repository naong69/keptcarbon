from app.services.province_service import ProvinceService
from app.services.landuse_service import LanduseService


class PlantationService:
    def __init__(self):
        self.pro_svc = ProvinceService()
        self.lu_svc = LanduseService()

    async def get_plantation_info(self, poly_data: dict) -> dict:
        poly_data = self.pro_svc.get_province(poly_data)
        if poly_data.get("province_code") is None:
            return {
                "polygon_id": poly_data.get("id"),
                "province_code": None,
                "geometry": poly_data.get("geometry"),
                "area_m2": poly_data.get("total_area_m2"),
                "status": poly_data.get("status"),
                "lu_polygon": None
            }

        poly_data = self.lu_svc.find_lu_class_area(poly_data)

        return {
            "polygon_id": poly_data.get("id"),
            "province_code": poly_data.get("province_code"),
            "geometry": poly_data.get("geometry"),
            "area_m2": poly_data.get("total_area_m2"),
            "status": poly_data.get("status"),
            "lu_polygon": poly_data.get("lu_polygon")
        }
